/**
 * 数据库 Schema 版本管理框架。
 *
 * 规范（见 AGENTS.md 第 3 节）：
 * - 每个迁移是独立脚本，明确起始/目标 Schema Version。
 * - 每个迁移在事务中执行，记录到 migration_history（含脚本校验值）。
 * - 按顺序执行，禁止跳过中间版本。
 * - 迁移失败立即停止并抛错，保护原数据。
 *
 * 当前 Schema Version 存储于 PRAGMA user_version，与软件版本独立管理。
 */
import { createHash } from 'crypto'
import type { DB } from './connection'
import { getUserVersion, setUserVersion, withTransaction } from './connection'
import { builtInMigrations } from './migrations'

export interface Migration {
  /** 迁移 ID，例如 001_initial_schema */
  id: string
  fromVersion: number
  toVersion: number
  description: string
  /** 迁移 SQL / 逻辑。在事务中执行。 */
  up: (db: DB) => void
}

function scriptHash(m: Migration): string {
  // 迁移脚本发布后不可修改；以 ID + 版本区间作为脚本内容指纹
  return createHash('sha256').update(`${m.id}:${m.fromVersion}->${m.toVersion}`).digest('hex')
}

export interface MigrationResult {
  fromVersion: number
  toVersion: number
  applied: Array<{ id: string; toVersion: number; executedAt: string; hash: string }>
}

/**
 * 将数据库迁移到最新版本。
 * 幂等：已是最新版本时不做任何事。
 */
export function migrate(db: DB): MigrationResult {
  const migrations = builtInMigrations

  // 校验迁移链完整性：连续、每次恰好 +1
  let expected = 0
  for (const m of migrations) {
    if (m.fromVersion !== expected) {
      throw new Error(`迁移链在 ${m.id} 处断裂：期望 from=${expected}`)
    }
    if (m.toVersion !== m.fromVersion + 1) {
      throw new Error(`迁移 ${m.id} 每次只能将版本号 +1`)
    }
    expected = m.toVersion
  }
  const latest = expected

  const current = getUserVersion(db)
  if (current > latest) {
    throw new Error(
      `数据库结构版本 v${current} 高于本软件支持的 v${latest}。` +
        `请升级 MyDesk。迁移已中止，数据未受任何影响。`
    )
  }

  const applied: MigrationResult['applied'] = []
  for (const m of migrations) {
    if (m.toVersion <= current) continue

    try {
      withTransaction(db, () => {
        m.up(db)
        db.prepare(
          `INSERT INTO migration_history
             (migration_id, from_version, to_version, description, script_hash, executed_at, success)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        ).run(m.id, m.fromVersion, m.toVersion, m.description, scriptHash(m), new Date().toISOString())
        setUserVersion(db, m.toVersion)
      })
    } catch (err) {
      throw new Error(
        `迁移 ${m.id}（v${m.fromVersion} -> v${m.toVersion}）失败：` +
          `${err instanceof Error ? err.message : String(err)}。` +
          `事务已回滚，原数据保持不变，升级已停止。`
      )
    }

    applied.push({
      id: m.id,
      toVersion: m.toVersion,
      executedAt: new Date().toISOString(),
      hash: scriptHash(m)
    })
  }

  return { fromVersion: current, toVersion: getUserVersion(db), applied }
}

/** 读取当前 Schema Version */
export function currentSchemaVersion(db: DB): number {
  return getUserVersion(db)
}
