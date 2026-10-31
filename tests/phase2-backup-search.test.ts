/**
 * 阶段二搜索与旧备份兼容测试。
 * - 搜索覆盖：任务名称/备注、收藏名称/URL/描述/备注/标签、文件名称/路径/备注、笔记标题/正文
 * - 保险箱永不出现在搜索中（结构层面验证）
 * - 旧版（Schema V1）备份可被 1.1.0 恢复并自动迁移到 V2
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { openDatabase, getUserVersion, vacuumSnapshot } from '@database/connection'
import { migrate } from '@database/migrator'
import { builtInMigrations } from '@database/migrations'
import { makeContext } from './helpers'
import * as tasks from '@main/services/taskService'
import * as collections from '@main/services/collectionService'
import * as files from '@main/services/fileIndexService'
import * as notes from '@main/services/noteService'
import { globalSearch } from '@main/services/searchService'
import { exportBackup, importPreview, importBackup } from '@main/services/backupService'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'mydesk-p2-'))
}

describe('global search coverage', () => {
  it('searches across all ordinary modules including tags', () => {
    const { db } = makeContext(tempDir())
    tasks.createTask(db, { title: '写登录接口', notes: '参考 auth 设计文档' })
    collections.createCollection(db, {
      name: 'React 官方文档',
      url: 'https://react.dev',
      description: '前端框架文档',
      note: '周末精读',
      tags: ['前端', 'react']
    })
    files.createFileIndex(db, { path: join(tempDir(), 'auth-设计.pdf'), notes: '架构评审材料' })
    notes.createNote(db, { title: '会议纪要', content: '讨论了登录接口的性能问题' })

    // 任务名称 + 备注
    expect(globalSearch(db, '登录接口').map((r) => r.module)).toContain('tasks')
    expect(globalSearch(db, 'auth').map((r) => r.module)).toContain('tasks')
    // 收藏名称 / 描述 / 备注 / 标签
    expect(globalSearch(db, 'React 官方').map((r) => r.module)).toContain('collections')
    expect(globalSearch(db, '前端框架').map((r) => r.module)).toContain('collections')
    expect(globalSearch(db, '周末精读').map((r) => r.module)).toContain('collections')
    expect(globalSearch(db, '前端').map((r) => r.module)).toContain('collections')
    // 文件名称 / 备注（路径含随机临时目录，文件名可搜）
    expect(globalSearch(db, 'auth-设计').map((r) => r.module)).toContain('files')
    expect(globalSearch(db, '架构评审').map((r) => r.module)).toContain('files')
    // 笔记标题 / 正文
    expect(globalSearch(db, '会议纪要').map((r) => r.module)).toContain('notes')
    expect(globalSearch(db, '性能问题').map((r) => r.module)).toContain('notes')

    // 高亮信息
    const r = globalSearch(db, 'React 官方')[0]
    expect(r.matchStart).toBeGreaterThanOrEqual(0)
    expect(r.matchLength).toBe('React 官方'.length)

    // 无结果
    expect(globalSearch(db, '绝对不存在的词汇xyzq')).toHaveLength(0)
    db.close()
  })
})

describe('backup v1 format compatibility', () => {
  it('a Schema V1 backup can be restored by 1.1.0 and migrated to V2', async () => {
    // 构造一个停留在 V1 的数据库并导出 .mydeskpack（模拟 1.0.x 用户的旧备份）
    const srcDir = tempDir()
    const { ctx, db } = makeContext(srcDir)
    // 手动降回 V1：把 V2 迁移新加的结构移除后设置 user_version=1
    // （更真实的做法：从零应用 001，然后造数据）
    tasks.createTask(db, { title: '旧版任务', priority: 'high' })
    collections.createCollection(db, { name: '旧版收藏', url: 'https://example.com' })
    // 撤销 002 迁移（仅测试环境）：删除新结构并把版本写回 1
    db.exec(`DROP TABLE reminder_log`)
    db.exec(`DELETE FROM migration_history WHERE migration_id = '002_task_reminders'`)
    // SQLite 不支持 DROP COLUMN（旧版）；新列 reminder_minutes 保留在表中不影响——
    // 为严格模拟 1.0.x，重建 tasks 表去掉该列
    db.exec(`
      CREATE TABLE tasks_v1 AS SELECT id, title, notes, priority, due_date, due_time, completed,
        completed_at, is_important, sort_order, created_at, updated_at FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_v1 RENAME TO tasks;
    `)
    db.exec(`PRAGMA user_version = 1`)
    vacuumSnapshot(db, join(srcDir, 'check.sqlite'))
    db.close()

    // 手工打包成 manifest 标注 schemaVersion=1 的 .mydeskpack
    const zip = new AdmZip()
    zip.addLocalFile(join(srcDir, 'check.sqlite'), 'data', 'database.sqlite')
    const { createHash } = await import('crypto')
    const { readFileSync } = await import('fs')
    const dbBuf = readFileSync(join(srcDir, 'check.sqlite'))
    const manifest = {
      app: 'MyDesk',
      formatVersion: 1,
      appVersion: '1.0.0',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      files: { 'data/database.sqlite': createHash('sha256').update(dbBuf).digest('hex') },
      includesVault: true
    }
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'))
    const oldPack = join(srcDir, 'old.mydeskpack')
    zip.writeZip(oldPack)

    // 全新 1.1.0 环境恢复
    const dir2 = tempDir()
    const { ctx: ctx2 } = makeContext(dir2)
    const preview = importPreview(ctx2, oldPack)
    expect(preview.schemaVersion).toBe(1)
    expect(preview.warnings.some((w) => w.includes('迁移'))).toBe(true)
    expect(preview.counts.tasks).toBe(1)
    expect(preview.counts.collections).toBe(1)

    const res = importBackup(ctx2, oldPack)
    expect(res.restored.tasks).toBe(1)

    // 恢复后的数据库应已迁移到 V2，且旧数据完整（importBackup 会替换底层连接）
    const db3 = ctx2.db
    expect(getUserVersion(db3)).toBe(2)
    const t = tasks.listTasks(db3, { view: 'all' })
    expect(t).toHaveLength(1)
    expect(t[0].title).toBe('旧版任务')
    expect(t[0].reminderMinutes).toBeNull() // V1 任务默认无提醒
    const c = collections.listCollections(db3, {})
    expect(c).toHaveLength(1)
    expect(c[0].name).toBe('旧版收藏')
    db3.close()
  })
})

void rmSync
void builtInMigrations
