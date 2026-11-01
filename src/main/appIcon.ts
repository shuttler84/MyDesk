/**
 * 应用图标路径解析（主进程各处共用）。
 * - 打包后：extraResources 中的 icon.png（由 electron-builder 从 build/icon.png 复制）
 * - 开发时：项目 build/icon.png
 * BrowserWindow / Tray / 快速添加窗口统一使用，确保任务栏与窗口图标一致。
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

export function resolveAppIconPath(): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png')
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) return p
  }
  return null
}
