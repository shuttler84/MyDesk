/**
 * Preload 桥接。
 * 只暴露一个受控的 invoke 函数（通道白名单 + 统一信封），不暴露任何 Node 能力。
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

export interface IpcEnvelope<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

const CHANNELS: ReadonlySet<string> = new Set(Object.values(IPC) as string[])

const api = {
  invoke(channel: string, payload?: unknown): Promise<IpcEnvelope> {
    if (!CHANNELS.has(channel)) {
      return Promise.resolve({ ok: false, error: `未知通道：${channel}` })
    }
    return ipcRenderer.invoke(channel, payload) as Promise<IpcEnvelope>
  },
  /**
   * 订阅主进程单向推送（仅允许 push:* 通道）。
   * 返回取消订阅函数。
   */
  onPush(channel: string, callback: (payload: unknown) => void): () => void {
    if (channel !== 'push:notification') {
      throw new Error('不允许订阅该通道')
    }
    const listener = (_event: unknown, payload: unknown): void => {
      callback(payload)
    }
    ipcRenderer.on(channel, listener as never)
    return () => {
      ipcRenderer.removeListener(channel, listener as never)
    }
  }
}

export type MyDeskApi = typeof api

contextBridge.exposeInMainWorld('mydesk', api)
