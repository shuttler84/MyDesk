/**
 * 笔记服务 — Markdown 笔记 + 附件管理（平台无关）。
 * 附件存储在独立的 attachments 目录，通过 note_attachments 表建立引用关系。
 */
import { randomUUID } from 'crypto'
import { copyFileSync, statSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { DB } from '@database/connection'
import type { Note, NoteAttachment } from '@shared/types'
import { nowIso } from '@shared/datetime'
import type { ServiceContext } from './context'

export interface NoteRow {
  id: string
  title: string
  content: string
  category: string
  tags: string
  created_at: string
  updated_at: string
}

export function rowToNote(r: NoteRow): Note {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(r.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string')
  } catch {
    tags = []
  }
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    category: r.category,
    tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export interface NoteFilter {
  search?: string
  category?: string
  tag?: string
}

export function listNotes(db: DB, filter: NoteFilter): Note[] {
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (filter.search && filter.search.trim()) {
    where += ` AND (title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')`
    const like = `%${filter.search.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`
    params.push(like, like)
  }
  if (filter.category) {
    where += ` AND category = ?`
    params.push(filter.category)
  }
  let rows = db
    .prepare(`SELECT * FROM notes ${where} ORDER BY updated_at DESC`)
    .all(...params) as NoteRow[]
  if (filter.tag) {
    rows = rows.filter((r) => {
      try {
        const parsed = JSON.parse(r.tags)
        return Array.isArray(parsed) && parsed.includes(filter.tag)
      } catch {
        return false
      }
    })
  }
  return rows.map(rowToNote)
}

export function getNote(db: DB, id: string): Note {
  const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as NoteRow | undefined
  if (!row) throw new Error('笔记不存在')
  return rowToNote(row)
}

export function createNote(db: DB, input: { title: string; content: string; category?: string; tags?: string[] }): Note {
  const now = nowIso()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO notes (id, title, content, category, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.title, input.content, input.category ?? '', JSON.stringify(input.tags ?? []), now, now)
  return getNote(db, id)
}

export function updateNote(
  db: DB,
  id: string,
  patch: { title?: string; content?: string; category?: string; tags?: string[] }
): Note {
  const existing = getNote(db, id)
  db.prepare(
    `UPDATE notes SET title=?, content=?, category=?, tags=?, updated_at=? WHERE id=?`
  ).run(
    patch.title ?? existing.title,
    patch.content ?? existing.content,
    patch.category ?? existing.category,
    JSON.stringify(patch.tags ?? existing.tags),
    nowIso(),
    id
  )
  return getNote(db, id)
}

export function deleteNote(ctx: ServiceContext, id: string): void {
  const attachments = listAttachments(ctx.db, id)
  for (const a of attachments) {
    removeAttachmentFile(ctx, a)
  }
  const res = ctx.db.prepare(`DELETE FROM notes WHERE id = ?`).run(id)
  if (res.changes === 0) throw new Error('笔记不存在')
}

// ---------- 附件 ----------

function safeStoredName(ctx: ServiceContext, originalName: string): string {
  // 附件在磁盘上使用随机存储名，原始文件名仅保存在数据库中
  const id = randomUUID()
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : ''
  return `${id}${ext.replace(/[^.\w-]/g, '')}`
}

export function listAttachments(db: DB, noteId: string): NoteAttachment[] {
  const rows = db
    .prepare(`SELECT * FROM note_attachments WHERE note_id = ? ORDER BY created_at ASC`)
    .all(noteId) as Array<Record<string, unknown>>
  return rows.map(
    (r): NoteAttachment => ({
      id: String(r.id),
      noteId: String(r.note_id),
      fileName: String(r.file_name),
      storedName: String(r.stored_name),
      mime: String(r.mime),
      size: Number(r.size),
      createdAt: String(r.created_at)
    })
  )
}

interface AttachmentRow {
  id: string
  note_id: string
  file_name: string
  stored_name: string
  mime: string
  size: number
  created_at: string
}

function getAttachment(db: DB, id: string): AttachmentRow {
  const row = db.prepare(`SELECT * FROM note_attachments WHERE id = ?`).get(id) as
    | AttachmentRow
    | undefined
  if (!row) throw new Error('附件不存在')
  return row
}

/** 从源文件复制一份到附件目录（不移动、不删除原文件） */
export function addAttachment(
  ctx: ServiceContext,
  noteId: string,
  sourcePath: string,
  mime?: string
): NoteAttachment {
  getNote(ctx.db, noteId) // 确认笔记存在
  const st = statSync(sourcePath)
  if (!st.isFile()) throw new Error('不是文件')
  if (st.size > 20 * 1024 * 1024) throw new Error('附件超过 20 MB 大小限制')
  const originalName = sourcePath.slice(Math.max(sourcePath.lastIndexOf('\\'), sourcePath.lastIndexOf('/')) + 1)
  const storedName = safeStoredName(ctx, originalName)
  mkdirSync(ctx.attachmentsDir, { recursive: true })
  copyFileSync(sourcePath, join(ctx.attachmentsDir, storedName))
  const id = randomUUID()
  ctx.db
    .prepare(
      `INSERT INTO note_attachments (id, note_id, file_name, stored_name, mime, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, noteId, originalName, storedName, mime ?? 'application/octet-stream', st.size, nowIso())
  const row = getAttachment(ctx.db, id)
  return {
    id: row.id,
    noteId: row.note_id,
    fileName: row.file_name,
    storedName: row.stored_name,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at
  }
}

function removeAttachmentFile(ctx: ServiceContext, a: NoteAttachment): void {
  const p = join(ctx.attachmentsDir, a.storedName)
  if (existsSync(p)) unlinkSync(p)
}

export function removeAttachment(ctx: ServiceContext, attachmentId: string): void {
  const row = getAttachment(ctx.db, attachmentId)
  ctx.db.prepare(`DELETE FROM note_attachments WHERE id = ?`).run(attachmentId)
  const p = join(ctx.attachmentsDir, row.stored_name)
  if (existsSync(p)) unlinkSync(p)
}

export function noteCategories(db: DB): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT category FROM notes WHERE category != '' ORDER BY category`)
    .all() as Array<{ category: string }>
  return rows.map((r) => r.category)
}

export function allNoteTags(db: DB): string[] {
  const rows = db.prepare(`SELECT tags FROM notes`).all() as Array<{ tags: string }>
  const set = new Set<string>()
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.tags)
      if (Array.isArray(parsed)) parsed.forEach((t) => typeof t === 'string' && set.add(t))
    } catch {
      /* ignore */
    }
  }
  return [...set].sort()
}
