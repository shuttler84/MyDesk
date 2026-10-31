/**
 * 服务层上下文：业务逻辑只依赖此接口，不直接依赖 Electron。
 */
import type { DB } from '@database/connection'
import type { PlatformAdapter } from '../platform/types'

export interface ServiceContext {
  db: DB
  platform: PlatformAdapter
  attachmentsDir: string
  /** 应用版本（来自 package.json） */
  appVersion: string
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}
