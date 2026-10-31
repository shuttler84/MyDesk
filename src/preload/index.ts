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
  }
}

export type MyDeskApi = typeof api

contextBridge.exposeInMainWorld('mydesk', api)
