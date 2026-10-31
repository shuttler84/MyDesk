/**
 * 活动记录（Timeline 数据来源之一）。
 */
import type { DB } from '@database/connection'
import { nowIso } from './context'

export type ActivityType =
  | 'task_created'
  | 'task_completed'
  | 'collection_created'
  | 'file_created'
  | 'note_created'
  | 'backup_exported'
  | 'backup_imported'
  | 'vault_setup'
  | 'vault_unlocked'

export function logActivity(
  db: DB,
  type: ActivityType,
  refId: string | null,
  title: string
): void {
  db.prepare(
    'INSERT INTO activity_log (type, ref_id, title, created_at) VALUES (?, ?, ?, ?)'
  ).run(type, refId, title, nowIso())
}
