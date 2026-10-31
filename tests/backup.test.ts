/**
 * .mydeskpack 备份/恢复测试。
 * 覆盖：导出结构与校验值 / 导入预览 / 完整恢复 / 完整性校验失败拒绝 /
 * 导入失败不破坏原数据库 / Schema 兼容性。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import AdmZip from 'adm-zip'
import { makeContext } from './helpers'
import * as tasks from '@main/services/taskService'
import * as collections from '@main/services/collectionService'
import * as notes from '@main/services/noteService'
import * as files from '@main/services/fileIndexService'
import * as vault from '@main/services/vaultService'
import { exportBackup, importPreview, importBackup } from '@main/services/backupService'
import { getUserVersion } from '@database/connection'

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'mydesk-backup-'))
  return d
}

async function seedVault(ctx: Parameters<typeof vault.setupVault>[0] extends never ? never : never): Promise<void> {
  /* placeholder, not used */
}
void seedVault

describe('backup .mydeskpack', () => {
  it('export creates archive with manifest + checksums; preview shows counts', async () => {
    const dir = tempDir()
    const { ctx, db } = makeContext(dir)
    tasks.createTask(db, { title: 'task A' })
    collections.createCollection(db, { name: 'GH', url: 'https://github.com/x/y' })
    notes.createNote(db, { title: 'note 1', content: '# hello' })
    files.createFileIndex(db, { path: join(dir, 'some-file.txt') })
    // 保险箱（保持加密）
    const session = vault.createSession()
    await vault.setupVault(db, 'vault-pw-123')
    await vault.unlockVault(db, session, 'vault-pw-123')
    vault.addItem(session, { name: 'api', secret: 'do-not-leak' })
    vault.persistContainer(db, session)
    vault.wipeSession(session)

    const packPath = join(dir, 'test.mydeskpack')
    const res = exportBackup(ctx, packPath)
    expect(existsSync(packPath)).toBe(true)
    expect(res.fileCount).toBeGreaterThanOrEqual(1)

    // 归档结构
    const zip = new AdmZip(packPath)
    expect(zip.getEntry('manifest.json')).toBeTruthy()
    expect(zip.getEntry('data/database.sqlite')).toBeTruthy()
    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8'))
    expect(manifest.app).toBe('MyDesk')
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.schemaVersion).toBe(1)
    expect(manifest.includesVault).toBe(true)
    expect(Object.keys(manifest.files)).toContain('data/database.sqlite')

    // 预览
    const preview = importPreview(ctx, packPath)
    expect(preview.counts.tasks).toBe(1)
    expect(preview.counts.collections).toBe(1)
    expect(preview.counts.notes).toBe(1)
    expect(preview.counts.files).toBe(1)
    expect(preview.counts.vaultEncrypted).toBe(true)
    db.close()
  })

  it('import restores all data into a fresh database (vault stays encrypted)', async () => {
    const dir = tempDir()
    const { ctx, db } = makeContext(dir)
    const t = tasks.createTask(db, { title: 'survivor', priority: 'high' })
    notes.createNote(db, { title: 'md note', content: 'body' })
    const session = vault.createSession()
    await vault.setupVault(db, 'pw-cross-123')
    await vault.unlockVault(db, session, 'pw-cross-123')
    vault.addItem(session, { name: 'svc', secret: 'restored-secret' })
    vault.persistContainer(db, session)
    vault.wipeSession(session)

    const packPath = join(dir, 'full.mydeskpack')
    exportBackup(ctx, packPath)
    db.close()

    // 全新环境恢复
    const dir2 = tempDir()
    const { ctx: ctx2 } = makeContext(dir2)
    const res = importBackup(ctx2, packPath)
    const db2 = ctx2.db // importBackup 会替换底层连接，必须使用新引用
    expect(res.restored.tasks).toBe(1)
    expect(res.restored.notes).toBe(1)

    const restoredTask = tasks.listTasks(db2, { view: 'all' })
    expect(restoredTask).toHaveLength(1)
    expect(restoredTask[0].title).toBe('survivor')

    // 保险箱用原主密码解锁
    const s2 = vault.createSession()
    await vault.unlockVault(db2, s2, 'pw-cross-123')
    const items = vault.listItems(s2)
    expect(items).toHaveLength(1)
    expect(items[0].secret).toBe('restored-secret')
    vault.wipeSession(s2)
    void t
    db2.close()
  })

  it('rejects tampered archives (checksum mismatch)', async () => {
    const dir = tempDir()
    const { ctx, db } = makeContext(dir)
    tasks.createTask(db, { title: 't' })
    const packPath = join(dir, 'tamper.mydeskpack')
    exportBackup(ctx, packPath)
    db.close()

    // 修改 manifest 之外的数据库内容 → 校验失败
    const zip = new AdmZip(packPath)
    const dbEntry = zip.getEntry('data/database.sqlite')!
    const data = dbEntry.getData()
    data[data.length - 100] = data[data.length - 100] ^ 0xff
    zip.updateFile(dbEntry, data)
    const tamperedPath = join(dir, 'tampered.mydeskpack')
    zip.writeZip(tamperedPath)

    const { ctx: ctx2 } = makeContext(tempDir())
    expect(() => importPreview(ctx2, tamperedPath)).toThrow(/完整性校验失败/)
  })

  it('failed import leaves the original database untouched', async () => {
    const dir = tempDir()
    const { ctx, db } = makeContext(dir)
    tasks.createTask(db, { title: 'original-1' })
    const packPath = join(dir, 'bad.mydeskpack')
    exportBackup(ctx, packPath)

    // 构造一个结构损坏的包（替换 db 为垃圾数据并更新校验值，使其通过哈希但 integrity 失败）
    const zip = new AdmZip(packPath)
    const garbage = Buffer.from('this is not a sqlite database'.repeat(100), 'utf8')
    zip.updateFile('data/database.sqlite', garbage)
    const { createHash } = await import('crypto')
    const manifestEntry = zip.getEntry('manifest.json')!
    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))
    manifest.files['data/database.sqlite'] = createHash('sha256').update(garbage).digest('hex')
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)))
    const badPath = join(dir, 'bad-corrupted.mydeskpack')
    zip.writeZip(badPath)

    // 恢复目标环境（有数据）
    const dir2 = tempDir()
    const { ctx: ctx2, db: db2 } = makeContext(dir2)
    tasks.createTask(db2, { title: 'precious-data' })

    expect(() => importBackup(ctx2, badPath)).toThrow()
    // 原数据完好
    const list = tasks.listTasks(db2, { view: 'all' })
    expect(list.map((t) => t.title)).toContain('precious-data')
    expect(list.map((t) => t.title)).not.toContain('original-1')
    db.close()
    db2.close()
    void readFileSync
    void writeFileSync
    void getUserVersion
  })

  it('rejects packs from a newer schema version', async () => {
    const dir = tempDir()
    const { ctx, db } = makeContext(dir)
    const packPath = join(dir, 'future.mydeskpack')
    exportBackup(ctx, packPath)
    db.close()

    // 把 manifest 的 schemaVersion 提到未来并同步 user_version
    const zip = new AdmZip(packPath)
    // 提取 db，改 user_version 后重新打包（更新校验值）
    const tmpDb = join(dir, 'future.sqlite')
    zip.extractAllTo(dir, true)
    const { execSync } = await import('child_process')
    void execSync
    // 直接用 node:sqlite 打开修改
    const { DatabaseSync } = await import('node:sqlite')
    {
      const d = new DatabaseSync(tmpDb)
      d.exec(`PRAGMA user_version = 99`)
      d.close()
    }
    zip.updateFile('data/database.sqlite', readFileSync(tmpDb))
    const manifest = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf8'))
    const { createHash } = await import('crypto')
    const newDbData = readFileSync(tmpDb)
    manifest.files['data/database.sqlite'] = createHash('sha256').update(newDbData).digest('hex')
    manifest.schemaVersion = 99
    zip.updateFile('manifest.json', Buffer.from(JSON.stringify(manifest)))
    const futurePath = join(dir, 'future-packed.mydeskpack')
    zip.writeZip(futurePath)

    const { ctx: ctx2 } = makeContext(tempDir())
    expect(() => importPreview(ctx2, futurePath)).toThrow(/高于本软件支持的/)
  })
})
