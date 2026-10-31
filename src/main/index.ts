/**
 * MyDesk 主进程入口。
 * 安全基线（AGENTS.md 第 7 节）：
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - 仅通过 preload 暴露受控 IPC 白名单
 * - 阻止导航到任意外部地址、阻止新窗口
 */
import { app, BrowserWindow, shell, Menu } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { openDatabase, closeDatabase } from '@database/connection'
import { migrate, currentSchemaVersion } from '@database/migrator'
import { LATEST_SCHEMA_VERSION } from '@database/migrations'
import { createElectronPlatform } from './platform/electron'
import { registerAllIpc } from './ipc'
import { VaultManager } from './vaultManager'
import type { ServiceContext } from './services/context'

// 防止多实例并发写数据库
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let ctx: ServiceContext | null = null
let vault: VaultManager | null = null
let autoLockTimer: NodeJS.Timeout | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4faf7',
    autoHideMenuBar: true,
    title: 'MyDesk',
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // 阻止任意导航与弹窗（本地应用只加载自身页面）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? ''
    const isDevServer = !!process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)
    if (!isDevServer && !url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
    void current
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function initDatabase(): void {
  const platform = createElectronPlatform()
  mkdirSync(platform.dataDir(), { recursive: true })
  mkdirSync(platform.attachmentsDir(), { recursive: true })

  const dbPath = platform.dbPath()
  const db = openDatabase(dbPath)

  // Schema Migration：启动时自动按序执行（V0 → V1 → ...）
  const result = migrate(db)
  if (result.applied.length > 0) {
    console.log(
      `[MyDesk] Schema migrated: v${result.fromVersion} -> v${result.toVersion}`,
      result.applied.map((a) => a.id).join(', ')
    )
  }
  const version = currentSchemaVersion(db)
  if (version !== LATEST_SCHEMA_VERSION) {
    // migrate() 保证到达最新或抛错，此处为防御性检查
    throw new Error(`Unexpected schema version ${version}`)
  }

  ctx = {
    db,
    platform,
    attachmentsDir: platform.attachmentsDir(),
    appVersion: app.getVersion()
  }
}

function setupAutoLock(): void {
  autoLockTimer = setInterval(() => {
    if (ctx && vault) {
      vault.autoLockIfNeeded(ctx.db)
    }
  }, 30_000)
  if (autoLockTimer.unref) autoLockTimer.unref()
}

app.whenReady().then(() => {
  try {
    initDatabase()
  } catch (err) {
    // 数据库迁移失败：按规范停止启动，保护数据，向用户展示明确错误
    const { dialog } = require('electron') as typeof import('electron')
    dialog.showErrorBox(
      'MyDesk —— 数据库错误',
      '数据库无法打开或完成迁移。' +
        '你的数据没有被修改。请查看以下错误信息：\n\n' +
        (err instanceof Error ? err.message : String(err))
    )
    app.quit()
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  vault = new VaultManager()
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  registerAllIpc(ctx!, vault!)
  setupAutoLock()

  Menu.setApplicationMenu(null)
  createWindow()

  // 验收辅助：MYDESK_UI_TOUR=<目录> 时自动遍历页面截图（不影响正常使用）
  if (process.env.MYDESK_UI_TOUR) {
    mainWindow?.webContents.once('did-finish-load', () => {
      void import('./uiTour').then(({ runUiTour }) => {
        if (mainWindow) void runUiTour(mainWindow)
      })
    })
  }
  // 验收辅助：MYDESK_E2E=1 时通过真实 UI 创建任务并验证（完成后退出）
  if (process.env.MYDESK_E2E) {
    mainWindow?.webContents.once('did-finish-load', () => {
      void import('./e2eProbe').then(({ runE2EProbe }) => {
        if (mainWindow) void runE2EProbe(mainWindow)
      })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  if (autoLockTimer) clearInterval(autoLockTimer)
  if (vault) vault.lock()
  if (ctx) closeDatabase(ctx.db)
  ctx = null
})

// 未捕获异常：记录但不输出敏感内容
process.on('uncaughtException', (err) => {
  console.error('[MyDesk] uncaught exception:', err.message)
})
