/**
 * 系统托盘。
 * - 左键点击：显示主窗口
 * - 右键菜单：显示主窗口 / 全局快速添加 / 立即备份 / 退出
 * - 关闭主窗口行为由设置控制（ask / tray / exit）
 */
import { Tray, Menu, nativeImage } from 'electron'
import { QUICK_ADD_HOTKEY } from './quickAdd'
import { resolveAppIconPath } from './appIcon'

export interface TrayDeps {
  showMainWindow: () => void
  showQuickAdd: () => void
  backupNow: () => void
  quitApp: () => void
  getHotkey: () => string
}

let tray: Tray | null = null

function resolveIconPath(): string | null {
  return resolveAppIconPath()
}

export function createTray(deps: TrayDeps): Tray | null {
  const iconPath = resolveIconPath()
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }))
  tray.setToolTip('MyDesk — 个人数字工作台')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => deps.showMainWindow() },
      { label: `全局快速添加（${deps.getHotkey()}）`, click: () => deps.showQuickAdd() },
      { type: 'separator' },
      { label: '立即备份', click: () => deps.backupNow() },
      { type: 'separator' },
      { label: '退出 MyDesk', click: () => deps.quitApp() }
    ])
  )
  tray.on('click', () => deps.showMainWindow())
  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
