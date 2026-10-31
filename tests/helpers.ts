/**
 * 测试辅助：临时目录上下文 + 平台桩（PlatformAdapter 的测试实现）。
 */
import { mkdtempSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDatabase, type DB } from '@database/connection'
import { migrate } from '@database/migrator'
import type { PlatformAdapter } from '@main/platform/types'
import type { ServiceContext } from '@main/services/context'

export function withTempDir(fn: (dir: string) => Promise<void> | void): Promise<void> | void {
  const dir = mkdtempSync(join(tmpdir(), 'mydesk-test-'))
  try {
    return fn(dir)
  } finally {
    if (typeof (fn as { cleanup?: boolean }).cleanup !== 'object') {
      // 延迟清理，便于断言失败时查看（测试结束后统一删除）
    }
  }
}

export function makePlatform(dir: string): PlatformAdapter {
  return {
    name: 'test-platform',
    dataDir: () => dir,
    dbPath: () => join(dir, 'mydesk.db'),
    attachmentsDir: () => {
      const a = join(dir, 'attachments')
      mkdirSync(a, { recursive: true })
      return a
    },
    openExternal: async () => undefined,
    openPath: async () => true,
    showItemInFolder: () => undefined,
    clipboardWriteText: () => undefined,
    clipboardReadText: async () => '',
    pickFile: async () => null,
    pickSaveFile: async () => null,
    pickDirectory: async () => null
  }
}

export function makeContext(dir: string, appVersion = '1.0.0'): { ctx: ServiceContext; db: DB } {
  const db = openDatabase(join(dir, 'mydesk.db'))
  migrate(db)
  const ctx: ServiceContext = {
    db,
    platform: makePlatform(dir),
    attachmentsDir: join(dir, 'attachments'),
    appVersion
  }
  mkdirSync(ctx.attachmentsDir, { recursive: true })
  return { ctx, db }
}
