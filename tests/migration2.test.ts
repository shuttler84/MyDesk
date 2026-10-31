/**
 * Schema V2 迁移测试：V1 → V2 数据保留、新结构可用、迁移历史记录。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDatabase, getUserVersion } from '@database/connection'
import { migrate } from '@database/migrator'
import { LATEST_SCHEMA_VERSION, builtInMigrations } from '@database/migrations'

function tempDbPath(): string {
  const d = mkdtempSync(join(tmpdir(), 'mydesk-mig2-'))
  return join(d, 'test.db')
}

describe('schema v2 migration', () => {
  it('migrates fresh db to v2 with new structures', () => {
    const db = openDatabase(tempDbPath())
    const res = migrate(db)
    expect(res.toVersion).toBe(LATEST_SCHEMA_VERSION)
    expect(LATEST_SCHEMA_VERSION).toBe(3)

    // 新列存在
    const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>
    expect(cols.map((c) => c.name)).toContain('reminder_minutes')

    // reminder_log 表存在且可用（外键级联）
    const id = 't-1'
    db.prepare(
      `INSERT INTO tasks (id, title, priority, created_at, updated_at) VALUES (?, '带提醒任务', 'high', ?, ?)`
    ).run(id, new Date().toISOString(), new Date().toISOString())
    db.prepare(
      `INSERT INTO reminder_log (id, task_id, kind, reminded_at) VALUES ('r-1', ?, 'due', ?)`
    ).run(id, new Date().toISOString())
    expect((db.prepare(`SELECT COUNT(*) AS c FROM reminder_log`).get() as { c: number }).c).toBe(1)
    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
    expect((db.prepare(`SELECT COUNT(*) AS c FROM reminder_log`).get() as { c: number }).c).toBe(0)

    // 迁移历史两条
    const history = db.prepare(`SELECT migration_id FROM migration_history ORDER BY to_version`).all() as Array<{
      migration_id: string
    }>
    expect(history[0].migration_id).toBe('001_initial_schema')
    expect(history[1].migration_id).toBe('002_task_reminders')
    db.close()
  })

  it('preserves V1 data when upgrading to V2', () => {
    const path = tempDbPath()
    // 手动把库停在 V1（模拟 1.0.x 用户数据库）
    const db = openDatabase(path)
    builtInMigrations[0].up(db)
    db.exec(`PRAGMA user_version = 1`)
    db.prepare(
      `INSERT INTO tasks (id, title, priority, created_at, updated_at) VALUES ('v1t', '阶段一的任务', 'low', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString())
    db.prepare(`INSERT INTO collections (id, name, url, created_at, updated_at) VALUES ('v1c', '阶段一的收藏', 'https://example.com', ?, ?)`).run(
      new Date().toISOString(),
      new Date().toISOString()
    )
    db.close()

    const db2 = openDatabase(path)
    const res = migrate(db2)
    expect(res.toVersion).toBe(LATEST_SCHEMA_VERSION)
    expect(res.fromVersion).toBe(1)
    const t = db2.prepare(`SELECT title, priority FROM tasks WHERE id = 'v1t'`).get() as { title: string; priority: string }
    expect(t.title).toBe('阶段一的任务')
    const c = db2.prepare(`SELECT name FROM collections WHERE id = 'v1c'`).get() as { name: string }
    expect(c.name).toBe('阶段一的收藏')
    // 旧任务 reminder_minutes 默认 NULL
    const rm = db2.prepare(`SELECT reminder_minutes FROM tasks WHERE id = 'v1t'`).get() as { reminder_minutes: number | null }
    expect(rm.reminder_minutes).toBeNull()
    db2.close()
  })

  it('v2 columns participate in task CRUD', () => {
    const db = openDatabase(tempDbPath())
    migrate(db)
    db.prepare(
      `INSERT INTO tasks (id, title, reminder_minutes, created_at, updated_at) VALUES ('r', '提醒任务', 15, ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString())
    const row = db.prepare(`SELECT reminder_minutes FROM tasks WHERE id = 'r'`).get() as { reminder_minutes: number }
    expect(row.reminder_minutes).toBe(15)
    db.close()
  })
})
