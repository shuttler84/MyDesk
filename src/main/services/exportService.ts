/**
 * 通用数据导出：JSON / CSV / Markdown。
 * 普通导出永远不包含保险箱数据（vault_store 表不在导出范围内）。
 * 若需要导出保险箱，只能通过受保护的加密备份 .mydeskpack 完成。
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { DB } from '@database/connection'
import type { ExportFormat, Task, Collection, FileIndexItem, Note } from '@shared/types'
import { nowIso } from '@shared/datetime'
import { listTasks } from './taskService'
import { listCollections, type CollectionRow, rowToCollection } from './collectionService'
import { listFiles, type FileRow, rowToItem } from './fileIndexService'
import { listNotes, type NoteRow, rowToNote } from './noteService'
import { getUserVersion } from '@database/connection'

// ---------- helpers ----------

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  // UTF-8 BOM：保证 Excel 打开中文不乱码
  return '\uFEFF' + lines.join('\r\n')
}

function jsonWrite(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

// ---------- 导出实现 ----------

interface JsonExport {
  app: 'MyDesk'
  kind: 'full-json-export'
  exportedAt: string
  appVersion: string
  schemaVersion: number
  /** 永不包含保险箱数据 */
  includesVault: false
  tasks: Task[]
  collections: Collection[]
  fileIndex: FileIndexItem[]
  notes: Note[]
}

export function buildJsonExport(db: DB, appVersion: string): JsonExport {
  return {
    app: 'MyDesk',
    kind: 'full-json-export',
    exportedAt: nowIso(),
    appVersion,
    schemaVersion: getUserVersion(db),
    includesVault: false,
    tasks: listTasks(db, { view: 'all' }),
    collections: listCollections(db, {}),
    fileIndex: listFiles(db, {}),
    notes: listNotes(db, {})
  }
}

export function buildTasksCsv(db: DB): string {
  const tasks = listTasks(db, { view: 'all' })
  return toCsv(
    ['id', 'title', 'priority', 'dueDate', 'dueTime', 'completed', 'completedAt', 'isImportant', 'notes', 'createdAt'],
    tasks.map((t) => [
      t.id,
      t.title,
      t.priority,
      t.dueDate ?? '',
      t.dueTime ?? '',
      t.completed ? 'yes' : 'no',
      t.completedAt ?? '',
      t.isImportant ? 'yes' : 'no',
      t.notes,
      t.createdAt
    ])
  )
}

export function buildCollectionsCsv(db: DB): string {
  const rows = db
    .prepare(`SELECT * FROM collections ORDER BY created_at DESC`)
    .all() as unknown as CollectionRow[]
  const cols = rows.map(rowToCollection)
  return toCsv(
    ['id', 'name', 'url', 'type', 'description', 'note', 'tags', 'importance', 'researchStatus', 'createdAt'],
    cols.map((c) => [
      c.id,
      c.name,
      c.url,
      c.type,
      c.description,
      c.note,
      c.tags.join(';'),
      c.importance,
      c.researchStatus,
      c.createdAt
    ])
  )
}

export function buildFilesCsv(db: DB): string {
  const rows = db
    .prepare(`SELECT * FROM file_index ORDER BY created_at DESC`)
    .all() as unknown as FileRow[]
  const files = rows.map(rowToItem)
  return toCsv(
    ['id', 'name', 'path', 'fileType', 'size', 'version', 'tags', 'isInvalid', 'notes', 'createdAt'],
    files.map((f) => [
      f.id,
      f.name,
      f.path,
      f.fileType,
      f.size ?? '',
      f.version,
      f.tags.join(';'),
      f.isInvalid ? 'yes' : 'no',
      f.notes,
      f.createdAt
    ])
  )
}

export function buildNotesMarkdown(db: DB): string {
  const rows = db
    .prepare(`SELECT * FROM notes ORDER BY updated_at DESC`)
    .all() as unknown as NoteRow[]
  const notes = rows.map(rowToNote)
  const parts: string[] = [
    `# MyDesk Notes Export`,
    ``,
    `- Exported at: ${nowIso()}`,
    `- Note count: ${notes.length}`,
    ``
  ]
  for (const n of notes) {
    parts.push(`---`)
    parts.push(``)
    parts.push(`## ${n.title || '(untitled)'}`)
    parts.push(``)
    parts.push(
      `> category: ${n.category || '-'} | tags: ${n.tags.join(', ') || '-'} | created: ${n.createdAt} | updated: ${n.updatedAt}`
    )
    parts.push(``)
    parts.push(n.content)
    parts.push(``)
  }
  return parts.join('\n')
}

export function exportData(
  db: DB,
  format: ExportFormat,
  filePath: string,
  appVersion: string
): { path: string; count: number } {
  switch (format) {
    case 'json': {
      const data = buildJsonExport(db, appVersion)
      jsonWrite(filePath, data)
      return { path: filePath, count: data.tasks.length + data.collections.length + data.fileIndex.length + data.notes.length }
    }
    case 'csv-tasks': {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, buildTasksCsv(db), 'utf8')
      return { path: filePath, count: listTasks(db, { view: 'all' }).length }
    }
    case 'csv-collections': {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, buildCollectionsCsv(db), 'utf8')
      return { path: filePath, count: listCollections(db, {}).length }
    }
    case 'csv-files': {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, buildFilesCsv(db), 'utf8')
      return { path: filePath, count: listFiles(db, {}).length }
    }
    case 'md-notes': {
      mkdirSync(dirname(filePath), { recursive: true })
      const md = buildNotesMarkdown(db)
      writeFileSync(filePath, md, 'utf8')
      return { path: filePath, count: listNotes(db, {}).length }
    }
  }
}
