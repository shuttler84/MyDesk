/**
 * MyDesk 主进程入口（阶段二）。
 * 安全基线（AGENTS.md 第 7 节）：
 * - contextIsolation: true / nodeIntegration: false / sandbox: true
 * - 仅通过 preload 暴露受控 IPC 白名单 + 单向推送通道
 * - 阻止导航到任意外部地址、阻止新窗口
 *
 * 阶段二：系统托盘、全局快速添加（Ctrl+Shift+Space）、任务提醒调度、
 * 自动备份、统一通知中心、关窗行为（询问/托盘/退出）、开机启动。
 *
 * 边界说明（任务书第四节）：软件完全退出后不再有任何后台行为。
 */
import { app, BrowserWindow, shell, Menu, dialog } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { openDatabase, closeDatabase } from '@database/connection'
import { migrate, currentSchemaVersion } from '@database/migrator'
import { LATEST_SCHEMA_VERSION } from '@database/migrations'
import { createElectronPlatform } from './platform/electron'
import { registerAllIpc } from './ipc'
import { VaultManager } from './vaultManager'
import type { ServiceContext } from './services/context'
import { NotificationCenter, createNotifier } from './notificationCenter'
import { createTray, destroyTray } from './tray'
import { registerQuickAddShortcut, unregisterQuickAddShortcut, createOrShowQuickAdd, hideQuickAdd } from './quickAdd'
import { startReminderScheduler } from './reminderScheduler'
import { autoBackupIfDue } from './services/backupService'
import { ExtensionServer } from './services/extensionServer'
import { getSettings, updateSettings } from './services/settingsService'
import { isInQuietHours } from '@shared/reminder'
import { resolveAppIconPath } from './appIcon'

// 防止多实例并发写数据库
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let ctx: ServiceContext | null = null
let vault: VaultManager | null = null
let notifications: NotificationCenter | null = null
let notify: ReturnType<typeof createNotifier> | null = null
let tray: ReturnType<typeof createTray> = null
let autoLockTimer: NodeJS.Timeout | null = null
let autoBackupTimer: NodeJS.Timeout | null = null
let isQuitting = false

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

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
    icon: resolveAppIconPath() ?? undefined,
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

  // 关闭行为：由设置决定（ask 每次询问 / tray 隐藏到托盘 / exit 退出）
  mainWindow.on('close', (event) => {
    if (isQuitting || !ctx) return
    const settings = getSettings(ctx.db)
    if (settings.trayCloseBehavior === 'tray') {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
    if (settings.trayCloseBehavior === 'ask') {
      event.preventDefault()
      const win = mainWindow
      if (!win) return
      void showCloseDialog(win)
    }
    // 'exit'：不拦截，走正常关闭 → window-all-closed → quit
  })

  // 阻止任意导航与弹窗（本地应用只加载自身页面）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isDevServer = !!process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)
    if (!isDevServer && !url.startsWith('file://')) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
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

/** 关闭窗口询问对话框（可选记住选择） */
async function showCloseDialog(win: BrowserWindow): Promise<void> {
  if (!ctx) return
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: '关闭 MyDesk',
    message: '要关闭窗口还是最小化到系统托盘？',
    detail: '最小化到托盘后，MyDesk 仍在后台运行，任务提醒和全局快速添加（Ctrl+Shift+Space）可以继续使用。',
    buttons: ['最小化到托盘', '最小化到托盘并记住选择', '退出'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  const choice = response === 2 ? 'exit' : 'tray'
  if (response === 1 && ctx) {
    // 记住选择
    updateSettings(ctx.db, { trayCloseBehavior: 'tray' })
  }
  if (choice === 'tray') {
    win.hide()
  } else {
    isQuitting = true
    app.quit()
  }
}

function initDatabase(): void {
  const platform = createElectronPlatform()
  mkdirSync(platform.dataDir(), { recursive: true })
  mkdirSync(platform.attachmentsDir(), { recursive: true })

  const dbPath = platform.dbPath()
  const db = openDatabase(dbPath)

  // Schema Migration：启动时自动按序执行（V0 → V1 → V2 → ...）
  const result = migrate(db)
  if (result.applied.length > 0) {
    console.log(
      `[MyDesk] Schema migrated: v${result.fromVersion} -> v${result.toVersion}`,
      result.applied.map((a) => a.id).join(', ')
    )
  }
  const version = currentSchemaVersion(db)
  if (version !== LATEST_SCHEMA_VERSION) {
    throw new Error(`Unexpected schema version ${version}`)
  }

  ctx = {
    db,
    platform,
    attachmentsDir: platform.attachmentsDir(),
    appVersion: app.getVersion()
  }
}

function setupBackgroundServices(): void {
  if (!ctx || !notifications) return

  // 提醒调度（勿扰时段内不发系统通知，仅进入通知中心）
  startReminderScheduler(ctx, (item) => {
    notify?.(item)
  })

  // 自动备份检查：每 10 分钟一次（内部有频率与去重控制），绝不阻塞正常使用
  autoBackupTimer = setInterval(() => {
    if (!ctx || !notify) return
    try {
      const settings = getSettings(ctx.db)
      const quiet = isInQuietHours(new Date(), settings.quietStart, settings.quietEnd)
      const result = autoBackupIfDue(ctx, new Date())
      if (result) {
        notify({
          kind: 'success',
          title: '自动备份完成',
          body: `已创建 ${result.fileName}`,
          systemWhenHidden: !quiet
        })
      }
    } catch (err) {
      notify?.({
        kind: 'error',
        title: '自动备份失败',
        body: err instanceof Error ? err.message : String(err),
        systemWhenHidden: false
      })
    }
  }, 10 * 60_000)
  if (autoBackupTimer.unref) autoBackupTimer.unref()
}

app.whenReady().then(() => {
  try {
    initDatabase()
  } catch (err) {
    // 数据库迁移失败：按规范停止启动，保护数据，向用户展示明确错误
    dialog.showErrorBox(
      'MyDesk —— 数据库错误',
      '数据库无法打开或完成迁移。' +
        '你的数据没有被修改。请查看以下错误信息：\n\n' +
        (err instanceof Error ? err.message : String(err))
    )
    app.quit()
    return
  }

  vault = new VaultManager()
  notifications = new NotificationCenter()
  const extensionServer = new ExtensionServer()
  notify = createNotifier(notifications, () => {
    if (!ctx) return false
    const s = getSettings(ctx.db)
    return isInQuietHours(new Date(), s.quietStart, s.quietEnd)
  })
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  registerAllIpc(ctx!, vault!, { notifications: notifications!, hideQuickAdd, extensionServer })
  if (getSettings(ctx!.db).extensionEnabled) {
    extensionServer.start(ctx!)
  }
  setupBackgroundServices()

  // 开机启动（按设置）
  try {
    app.setLoginItemSettings({ openAtLogin: getSettings(ctx!.db).launchOnStartup })
  } catch (err) {
    console.error('[MyDesk] setLoginItemSettings failed:', err)
  }

  Menu.setApplicationMenu(null)
  createWindow()

  // 系统托盘
  tray = createTray({
    showMainWindow: showMainWindow,
    showQuickAdd: () => createOrShowQuickAdd(resolveAppIconPath() ?? undefined),
    backupNow: () => {
      try {
        if (!ctx) return
        void import('./services/backupService').then(({ runBackupNow }) => {
          if (!ctx) return
          const fileName = runBackupNow(ctx)
          notify?.({ kind: 'success', title: '备份完成', body: fileName, systemWhenHidden: true })
        })
      } catch (err) {
        notify?.({ kind: 'error', title: '备份失败', body: err instanceof Error ? err.message : String(err) })
      }
    },
    quitApp: () => {
      isQuitting = true
      app.quit()
    },
    getHotkey: () => 'Ctrl+Shift+Space'
  })

  // 全局快捷键（软件后台运行时可用；完全退出后注销）
  const shortcutOk = registerQuickAddShortcut()
  if (!shortcutOk && notify) {
    notify({
      kind: 'info',
      title: '全局快捷键未能注册',
      body: 'Ctrl+Shift+Space 可能被其他程序占用，可直接使用顶栏的快速添加按钮。'
    })
  }

  // 第二实例启动时聚焦主窗口
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

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
  // 验收辅助：MYDESK_E2E3=1 时验证阶段三（扩展本地服务安全 + V3 数据）
  if (process.env.MYDESK_E2E3) {
    mainWindow?.webContents.once('did-finish-load', () => {
      void import('./e2eProbe3').then(({ runE2EProbe3 }) => {
        if (mainWindow) void runE2EProbe3(mainWindow)
      })
    })
  }
  // 验收辅助：MYDESK_E2E2=1 时验证阶段二功能（快速添加/提醒）
  if (process.env.MYDESK_E2E2) {
    mainWindow?.webContents.once('did-finish-load', () => {
      void import('./e2eProbe2').then(({ runE2EProbe2 }) => {
        if (mainWindow) void runE2EProbe2(mainWindow, { showQuickAdd: () => createOrShowQuickAdd(resolveAppIconPath() ?? undefined), hideQuickAdd })
      })
    })
  }
})

app.on('second-instance', () => {
  showMainWindow()
})

app.on('window-all-closed', () => {
  // 托盘模式下窗口关闭≠退出；仅在用户明确退出（isQuitting）时结束进程
  if (isQuitting || !tray) {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  unregisterQuickAddShortcut()
  if (autoLockTimer) clearInterval(autoLockTimer)
  if (autoBackupTimer) clearInterval(autoBackupTimer)
  if (vault) vault.lock()
  destroyTray()
  if (ctx) closeDatabase(ctx.db)
  ctx = null
})

// 未捕获异常：记录但不输出敏感内容
process.on('uncaughtException', (err) => {
  console.error('[MyDesk] uncaught exception:', err.message)
})
void hideQuickAdd
