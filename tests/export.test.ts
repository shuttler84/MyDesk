/**
 * 通用导出测试（JSON / CSV / Markdown）。
 * 关键断言：导出永远不包含保险箱明文。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { makeContext } from './helpers'
import * as tasks from '@main/services/taskService'
import * as collections from '@main/services/collectionService'
import * as notes from '@main/services/noteService'
import * as vault from '@main/services/vaultService'
import { exportData, buildJsonExport } from '@main/services/exportService'

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'mydesk-export-'))
  return d
}

async function seeded(dir: string) {
  const { ctx, db } = makeContext(dir)
  tasks.createTask(db, { title: 'write tests', priority: 'high', notes: 'unit & integration' })
  tasks.createTask(db, { title: 'value,with"quote', notes: 'csv escaping' })
  collections.createCollection(db, { name: 'MDN', url: 'https://developer.mozilla.org', tags: ['docs', 'web'] })
  notes.createNote(db, { title: 'Recipe', content: '# Ingredients\n\n- tea' })
  // 保险箱数据不应出现在普通导出中
  const session = vault.createSession()
  await vault.setupVault(db, 'no-leak-pw-1')
  await vault.unlockVault(db, session, 'no-leak-pw-1')
  vault.addItem(session, { name: 'private item', username: 'secret-user', secret: 'TOPSECRET-VALUE' })
  vault.persistContainer(db, session)
  vault.wipeSession(session)
  return { ctx, db }
}

describe('export', () => {
  it('JSON export contains normal data but never vault plaintext', async () => {
    const dir = tempDir()
    const { ctx, db } = await seeded(dir)
    const out = join(dir, 'all.json')
    const res = exportData(db, 'json', out, ctx.appVersion)
    expect(res.count).toBe(4)
    const raw = readFileSync(out, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.app).toBe('MyDesk')
    expect(parsed.tasks).toHaveLength(2)
    expect(parsed.collections).toHaveLength(1)
    expect(parsed.notes).toHaveLength(1)
    expect(parsed.includesVault).toBe(false)
    expect(parsed.vault).toBeUndefined()
    expect(raw).not.toContain('TOPSECRET-VALUE')
    expect(raw).not.toContain('no-leak-pw-1')
    db.close()
  })

  it('CSV exports escape quotes/commas and include BOM', async () => {
    const dir = tempDir()
    const { db } = await seeded(dir)
    const out = join(dir, 'tasks.csv')
    exportData(db, 'csv-tasks', out, '1.0.0')
    const raw = readFileSync(out, 'utf8')
    expect(raw.charCodeAt(0)).toBe(0xfeff) // BOM
    expect(raw).toContain('"value,with""quote"')
    expect(raw).toContain('write tests')
    db.close()
  })

  it('Markdown export includes note titles and content, never vault data', async () => {
    const dir = tempDir()
    const { db } = await seeded(dir)
    const out = join(dir, 'notes.md')
    exportData(db, 'md-notes', out, '1.0.0')
    const raw = readFileSync(out, 'utf8')
    expect(raw).toContain('## Recipe')
    expect(raw).toContain('# Ingredients')
    expect(raw).not.toContain('TOPSECRET-VALUE')
    db.close()
  })

  it('collections & files CSV round-trip fields', async () => {
    const dir = tempDir()
    const { db } = await seeded(dir)
    const out = join(dir, 'collections.csv')
    exportData(db, 'csv-collections', out, '1.0.0')
    const raw = readFileSync(out, 'utf8')
    expect(raw).toContain('MDN')
    expect(raw).toContain('https://developer.mozilla.org')
    expect(raw).toContain('docs;web')
    db.close()
  })

  it('buildJsonExport shape is stable', async () => {
    const dir = tempDir()
    const { db } = await seeded(dir)
    const j = buildJsonExport(db, '9.9.9')
    expect(j.kind).toBe('full-json-export')
    expect(j.appVersion).toBe('9.9.9')
    expect(j.schemaVersion).toBe(1)
    db.close()
  })
})
