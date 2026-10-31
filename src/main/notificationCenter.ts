/**
 * 统一通知中心（主进程内存态，容量 100）。
 * - 所有通知都会推送到渲染层（push:notification）
 * - 主窗口隐藏/后台时，重要通知同时发系统通知（Windows 通知）
 * - 勿扰时段内不发系统通知，只进入通知中心
 */
import { BrowserWindow, Notification } from 'electron'
import { randomUUID } from 'crypto'
import { IPC } from '@shared/ipc'
import type { NotificationItem } from '@shared/types'
import { isInQuietHours } from '@shared/reminder'
import { nowIso } from './services/context'

export interface NotifyOptions {
  kind: NotificationItem['kind']
  title: string
  body: string
  /** 是否在窗口后台时弹系统通知 */
  systemWhenHidden?: boolean
}

export class NotificationCenter {
  private items: NotificationItem[] = []

  add(item: NotifyOptions, opts: { quietNow: boolean; mainWindowHidden: boolean }): NotificationItem {
    const n: NotificationItem = {
      id: randomUUID(),
      kind: item.kind,
      title: item.title,
      body: item.body,
      createdAt: nowIso()
    }
    this.items.unshift(n)
    if (this.items.length > 100) this.items.length = 100

    // 推送到所有窗口（渲染层通知中心 + Toast）
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC.PushNotification, n)
      }
    }

    // 后台系统通知（勿扰时段跳过）
    if (
      item.systemWhenHidden &&
      opts.mainWindowHidden &&
      !opts.quietNow &&
      Notification.isSupported()
    ) {
      const notification = new Notification({
        title: item.title,
        body: item.body,
        silent: false
      })
      notification.on('click', () => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.show()
          win.focus()
        }
      })
      notification.show()
    }
    return n
  }

  list(): NotificationItem[] {
    return this.items
  }

  clear(): void {
    this.items = []
  }
}

/** 便捷封装：判断勿扰 + 主窗口状态后入列 */
export function createNotifier(center: NotificationCenter, isQuietNow: () => boolean) {
  return (item: NotifyOptions): NotificationItem => {
    const windows = BrowserWindow.getAllWindows()
    const mainHidden = windows.length === 0 || windows.every((w) => w.isMinimized() || !w.isVisible())
    return center.add(item, { quietNow: isQuietNow(), mainWindowHidden: mainHidden })
  }
}
