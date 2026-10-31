/**
 * 阶段三测试：V2→V3 迁移、收藏分组/修改历史/统计、文件索引统计与 CSV 导入、
 * 时间轴扩展统计、浏览器扩展通信安全。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { openDatabase, getUserVersion, vacuumSnapshot } from '@database/connection'
import { migrate } from '@database/migrator'
import { makeContext } from './helpers'
import * as collections from '@main/services/collectionService'
import * as files from '@main/services/fileIndexService'
import { globalSearch } from '@main/services/searchService'
import { exportBackup, importPreview, importBackup } from '@main/services/backupService'
import { databaseIntegrity } from '@main/services/dataCenterService'
import { parseQuickAddInput } from '@shared/quickAdd'
import * as taskService from '@main/services/taskService'
import * as timelineService from '@main/services/timelineService'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'mydesk-p3-'))
}

describe('schema v3 migration', () => {
  it('migrates V2 data to V3 preserving everything', async () => {
    const path = join(tempDir(), 't.db')
    // 构造 V2 数据库
    const db = openDatabase(path)
    migrate(db)
    db.prepare(
      `INSERT INTO collections (id, name, url, created_at, updated_at) VALUES ('c1', 'V2收藏', 'https://example.com', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString())
    db.prepare(
      `INSERT INTO file_index (id, name, path, created_at, updated_at) VALUES ('f1', 'V2文件', 'C:\\a.txt', ?, ?)`
    ).run(new Date().toISOString(), new Date().toISOString())
    // 模拟 1.1.0 数据库：回退 user_version 到 2 并移除 V3 结构
    db.exec(`DROP TABLE collection_history`)
    db.exec(`DELETE FROM migration_history WHERE migration_id = '003_collection_groups_history'`)
    db.exec(`
      CREATE TABLE col_tmp AS SELECT id, name, url, type, description, note, tags, importance,
        research_status, favicon, preview_image, created_at, updated_at FROM collections;
      DROP TABLE collections;
      ALTER TABLE col_tmp RENAME TO collections;
    `)
    db.exec(`
      CREATE TABLE fi_tmp AS SELECT id, name, path, file_type, size, version, notes, tags,
        last_checked_at, is_invalid, created_at, updated_at FROM file_index;
      DROP TABLE file_index;
      ALTER TABLE fi_tmp RENAME TO file_index;
    `)
    db.exec(`PRAGMA user_version = 2`)
    db.close()

    // 1.2.0 升级
    const db2 = openDatabase(path)
    const res = migrate(db2)
    expect(res.fromVersion).toBe(2)
    expect(res.toVersion).toBe(3)
    const c = db2.prepare(`SELECT name, group_id FROM collections WHERE id = 'c1'`).get() as {
      name: string
      group_id: string | null
    }
    expect(c.name).toBe('V2收藏')
    expect(c.group_id).toBeNull()
    const f = db2.prepare(`SELECT origin_device FROM file_index WHERE id = 'f1'`).get() as {
      origin_device: string
    }
    expect(f.origin_device).toBe('windows')
    db2.close()
  })
})

describe('collection groups & history & stats (V3)', () => {
  it('group CRUD + assign collections + delete keeps items', () => {
    const { db } = makeContext(tempDir())
    const g = collections.createGroup(db, '前端学习')
    const c1 = collections.createCollection(db, { name: 'React 文档', url: 'https://react.dev', groupId: g.id })
    const c2 = collections.createCollection(db, { name: 'Vue 文档', url: 'https://vuejs.org' })
    expect(listOf(db).find((x) => x.id === g.id)).toBeTruthy()

    // 分组筛选
    let list = collections.listCollections(db, {})
    list = collections.filterByGroup(list, g.id)
    expect(list.map((x) => x.id)).toEqual([c1.id])
    list = collections.filterByGroup(collections.listCollections(db, {}), null)
    expect(list.map((x) => x.id)).toEqual([c2.id])

    // 移到分组/移出
    collections.updateCollection(db, c2.id, { groupId: g.id })
    expect(collections.filterByGroup(collections.listCollections(db, {}), g.id)).toHaveLength(2)
    collections.updateCollection(db, c2.id, { groupId: null })
    expect(collections.filterByGroup(collections.listCollections(db, {}), g.id)).toHaveLength(1)

    // 删除分组 → 收藏保留且未分组
    collections.deleteGroup(db, g.id)
    const all = collections.listCollections(db, {})
    expect(all).toHaveLength(2)
    expect(all.every((x) => x.groupId === null)).toBe(true)
    void c1
    db.close()
  })

  it('update writes history snapshots; history is ordered desc', () => {
    const { db } = makeContext(tempDir())
    const c = collections.createCollection(db, { name: '初始名', url: 'https://a.com', tags: ['v1'] })
    collections.updateCollection(db, c.id, { name: '第二次修改', tags: ['v2'] })
    collections.updateCollection(db, c.id, { name: '第三次修改', tags: ['v3'] })
    const history = collections.getCollectionHistory(db, c.id)
    expect(history).toHaveLength(2)
    // 最新在前：history[0] = 最近一次修改前的快照（第二次修改前的状态）
    expect(history[0].snapshot.name).toBe('第二次修改')
    expect(history[0].snapshot.tags).toEqual(['v2'])
    expect(history[1].snapshot.name).toBe('初始名')
    // 当前值
    expect(collections.getCollection(db, c.id).name).toBe('第三次修改')
    db.close()
  })

  it('tag AND/OR filters, sorting, duplicates, similar, stats', () => {
    const { db } = makeContext(tempDir())
    collections.createCollection(db, { name: 'A', url: 'https://a.com/1', tags: ['react', '教程'], importance: 'high' })
    collections.createCollection(db, { name: 'B', url: 'https://a.com/2', tags: ['react'] })
    collections.createCollection(db, { name: 'C', url: 'https://b.com/1', tags: ['vue'] })

    const all = collections.listCollections(db, {})
    expect(collections.filterByTagsMode(all, ['react', '教程'], 'and')).toHaveLength(1)
    expect(collections.filterByTagsMode(all, ['react', 'vue'], 'and')).toHaveLength(0)
    expect(collections.filterByTagsMode(all, ['react', 'vue'], 'or')).toHaveLength(3)

    const byName = collections.sortCollections(all, 'name_asc')
    expect(byName.map((x) => x.name)).toEqual(['A', 'B', 'C'])
    const byImportance = collections.sortCollections(all, 'importance')
    expect(byImportance[0].name).toBe('A')

    // 重复 URL
    collections.createCollection(db, { name: 'A2', url: 'https://a.com/1' })
    const dup = collections.findDuplicateUrls(db)
    expect(dup).toEqual([{ url: 'https://a.com/1', count: 2 }])
    const similar = collections.findSimilarCollections(db)
    expect(similar[0].host).toBe('a.com')

    const stats = collections.collectionStats(db)
    expect(stats.total).toBe(4)
    expect(stats.topTags[0].tag).toBe('react')
    expect(stats.topTags[0].count).toBe(2)
    db.close()
  })
})

describe('file index v3', () => {
  it('stats: type distribution, size, duplicates, recent', () => {
    const { ctx, db } = makeContext(tempDir())
    const p1 = join(ctx.attachmentsDir, '..', 'f1.txt')
    writeFileSync(p1, 'hello')
    files.createFileIndex(db, { path: p1 })
    files.createFileIndex(db, { path: p1 + '.bak', name: 'f1.txt.bak' })
    const stats = files.fileIndexStats(db)
    expect(stats.total).toBe(2)
    expect(stats.totalSize).toBeGreaterThanOrEqual(5)
    expect(stats.byType[0].fileType).toBe('txt')
    db.close()
  })

  it('csv import is idempotent (duplicates skipped)', () => {
    const { ctx, db } = makeContext(tempDir())
    const csvPath = join(ctx.attachmentsDir, 'import.csv')
    writeFileSync(
      csvPath,
      '\uFEFFid,name,path,fileType,size,version,tags,isInvalid,notes,createdAt\n' +
        'x1,说明文档,C:\\doc\\readme.md,md,100,1.0,docs;v3,no,导入测试,2026-10-31\n',
      'utf8'
    )
    const r1 = files.importFileIndexCsv(db, csvPath)
    expect(r1.imported).toBe(1)
    const r2 = files.importFileIndexCsv(db, csvPath)
    expect(r2.imported).toBe(0)
    expect(r2.skipped).toBe(1)
    const item = files.listFiles(db, { search: '说明文档' })
    expect(item).toHaveLength(1)
    expect(item[0].tags).toContain('v3')
    expect(item[0].originDevice).toBe('windows')
    db.close()
  })

  it('directory scan respects extensions, depth and max files', () => {
    const dir = tempDir()
    const sub = join(dir, 'sub')
    const { mkdirSync, writeFileSync } = require('fs') as typeof import('fs')
    mkdirSync(sub, { recursive: true })
    writeFileSync(join(dir, 'a.pdf'), 'x')
    writeFileSync(join(dir, 'b.txt'), 'y')
    writeFileSync(join(sub, 'c.pdf'), 'z')
    writeFileSync(join(sub, 'd.txt'), 'w')

    // 只扫 pdf、深度 0
    let r = files.scanDirectory(null, { directory: dir, extensions: ['pdf'], maxDepth: 0, maxFiles: 100 })
    expect(r.files.map((f) => f.name)).toEqual(['a.pdf'])
    // pdf、深度 1 → 包含子目录
    r = files.scanDirectory(null, { directory: dir, extensions: ['pdf'], maxDepth: 1, maxFiles: 100 })
    expect(r.files).toHaveLength(2)
    // 数量上限
    r = files.scanDirectory(null, { directory: dir, extensions: [], maxDepth: 1, maxFiles: 2 })
    expect(r.files.length).toBe(2)
  })

  it('cleanup invalid returns flagged entries', () => {
    const { db } = makeContext(tempDir())
    files.createFileIndex(db, { path: 'C:\\不存在\\never.txt' })
    const invalid = files.findInvalidEntries(db)
    expect(invalid).toHaveLength(1)
    expect(invalid[0].isInvalid).toBe(true)
    db.close()
  })
})

describe('timeline v2 stats & data integrity', () => {
  it('includes monthly/type/tag stats in timeline', () => {
    const { db } = makeContext(tempDir())
    const task = taskService.createTask(db, { title: 'x' })
    taskService.toggleTask(db, task.id)
    collections.createCollection(db, { name: 'GH', url: 'https://github.com/a/b', type: 'github', tags: ['dev'] })
    const s = timelineService.timelineStats(db, {})
    expect(s.monthlyTasks.length).toBeGreaterThanOrEqual(1)
    expect(s.typeDistribution[0].type).toBe('github')
    expect(s.tagUsage[0]).toEqual({ tag: 'dev', count: 1 })
    db.close()
    void globalSearch
  })

  it('database integrity report lists migrations', () => {
    const { db } = makeContext(tempDir())
    const report = databaseIntegrity(db)
    expect(report.integrity).toBe('ok')
    expect(report.schemaVersion).toBe(3)
    expect(report.migrations.map((m) => m.id)).toEqual([
      '001_initial_schema',
      '002_task_reminders',
      '003_collection_groups_history'
    ])
    expect(report.foreignKeyViolations).toBe(0)
    db.close()
  })

  it('V2 backup can be restored by 1.2.0 and migrated to V3', async () => {
    // 构造停留在 V2 的备份
    const dir = tempDir()
    const { ctx, db } = makeContext(dir)
    collections.createCollection(db, { name: 'V2时代的收藏', url: 'https://old.example.com' })
    db.exec(`DROP TABLE collection_history`)
    db.exec(`DELETE FROM migration_history WHERE migration_id = '003_collection_groups_history'`)
    db.exec(`DROP INDEX IF EXISTS idx_collections_group`)
    db.exec(`
      CREATE TABLE col_tmp (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, type TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
        importance TEXT NOT NULL DEFAULT 'medium', research_status TEXT NOT NULL DEFAULT 'unresearched',
        favicon TEXT, preview_image TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO col_tmp SELECT id, name, url, type, description, note, tags, importance,
        research_status, favicon, preview_image, created_at, updated_at FROM collections;
      DROP TABLE collections;
      ALTER TABLE col_tmp RENAME TO collections;
    `)
    db.exec(`
      CREATE TABLE fi_tmp (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, file_type TEXT NOT NULL DEFAULT '',
        size INTEGER, version TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]',
        last_checked_at TEXT, is_invalid INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO fi_tmp SELECT id, name, path, file_type, size, version, notes, tags,
        last_checked_at, is_invalid, created_at, updated_at FROM file_index;
      DROP TABLE file_index;
      ALTER TABLE fi_tmp RENAME TO file_index;
    `)
    db.exec(`PRAGMA user_version = 2`)
    const snap = join(dir, 'v2.sqlite')
    vacuumSnapshot(db, snap)
    db.close()

    const zip = new AdmZip()
    zip.addLocalFile(snap, 'data', 'database.sqlite')
    const { readFileSync } = await import('fs')
    const dbBuf = readFileSync(snap)
    const manifest = {
      app: 'MyDesk',
      formatVersion: 1,
      appVersion: '1.1.0',
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      files: { 'data/database.sqlite': createHash('sha256').update(dbBuf).digest('hex') },
      includesVault: true
    }
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'))
    const pack = join(dir, 'v2.mydeskpack')
    zip.writeZip(pack)

    const dir2 = tempDir()
    const { ctx: ctx2 } = makeContext(dir2)
    const preview = importPreview(ctx2, pack)
    expect(preview.schemaVersion).toBe(2)
    importBackup(ctx2, pack)
    const db3 = ctx2.db
    expect(getUserVersion(db3)).toBe(3)
    const c = collections.listCollections(db3, {})
    expect(c).toHaveLength(1)
    expect(c[0].name).toBe('V2时代的收藏')
    expect(c[0].groupId).toBeNull()
    // 完整性
    const report = databaseIntegrity(db3)
    expect(report.integrity).toBe('ok')
    db3.close()
  })
})

function listOf(db: Parameters<typeof collections.listGroups>[0]) {
  return collections.listGroups(db)
}
void rmSync
void parseQuickAddInput
