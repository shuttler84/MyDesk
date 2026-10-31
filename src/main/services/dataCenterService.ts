/**
 * 数据管理中心服务（阶段三）：数据库完整性检查、迁移记录、Schema 版本信息。
 * 全部只读，不修改数据。
 */
import type { DB } from '@database/connection'
import type { DatabaseIntegrityReport } from '@shared/types'
import { getUserVersion } from '@database/connection'

export function databaseIntegrity(db: DB): DatabaseIntegrityReport {
  const check = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
  const fk = db.prepare('PRAGMA foreign_key_check').all() as unknown[]
  const migrations = db
    .prepare(
      `SELECT migration_id, from_version, to_version, description, executed_at
       FROM migration_history ORDER BY to_version ASC`
    )
    .all() as Array<{
    migration_id: string
    from_version: number
    to_version: number
    description: string
    executed_at: string
  }>
  return {
    integrity: check.integrity_check === 'ok' ? 'ok' : 'failed',
    message: check.integrity_check,
    foreignKeyViolations: fk.length,
    schemaVersion: getUserVersion(db),
    migrations: migrations.map((m) => ({
      id: m.migration_id,
      fromVersion: Number(m.from_version),
      toVersion: Number(m.to_version),
      executedAt: m.executed_at,
      description: m.description
    }))
  }
}
