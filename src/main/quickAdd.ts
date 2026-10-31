/**
 * 全局快速添加窗口 + 全局快捷键（Ctrl+Shift+Space）。
 * 主窗口隐藏 / 最小化（软件在后台运行）时均可呼出；
 * 软件完全退出后快捷键随之注销（如实边界）。
 */
import { BrowserWindow, globalShortcut } from 'electron'
import { join } from 'path'

export const QUICK_ADD_HOTKEY = 'Ctrl+Shift+Space'

let quickAddWindow: BrowserWindow | null = null

export function createOrShowQuickAdd(parentIcon?: string): void {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.show()
    quickAddWindow.focus()
    return
  }
  quickAddWindow = new BrowserWindow({
    width: 660,
    height: 128,
    minWidth: 520,
    maxWidth: 760,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    center: true,
    title: 'MyDesk 快速添加',
    icon: parentIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  // 窗口失焦自动隐藏（点其他地方即收起，符合快速呼出习惯）
  quickAddWindow.on('blur', () => {
    if (quickAddWindow && !quickAddWindow.webContents.isDevToolsOpened()) {
      quickAddWindow.hide()
    }
  })
  quickAddWindow.once('closed', () => {
    quickAddWindow = null
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void quickAddWindow.loadURL(`${devUrl}?window=quickadd`)
  } else {
    void quickAddWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'quickadd' }
    })
  }
  quickAddWindow.once('ready-to-show', () => {
    quickAddWindow?.show()
    quickAddWindow?.focus()
  })
}

export function hideQuickAdd(): void {
  quickAddWindow?.hide()
}

export function toggleQuickAdd(parentIcon?: string): void {
  if (quickAddWindow && !quickAddWindow.isDestroyed() && quickAddWindow.isVisible()) {
    hideQuickAdd()
  } else {
    createOrShowQuickAdd(parentIcon)
  }
}

export function registerQuickAddShortcut(parentIcon?: string): boolean {
  try {
    const ok = globalShortcut.register(QUICK_ADD_HOTKEY, () => {
      toggleQuickAdd(parentIcon)
    })
    if (!ok) {
      console.error(`[MyDesk] 全局快捷键 ${QUICK_ADD_HOTKEY} 注册失败（可能被其他程序占用）`)
    }
    return ok
  } catch (err) {
    console.error('[MyDesk] globalShortcut error:', err)
    return false
  }
}

export function unregisterQuickAddShortcut(): void {
  try {
    globalShortcut.unregister(QUICK_ADD_HOTKEY)
  } catch {
    /* ignore */
  }
}
