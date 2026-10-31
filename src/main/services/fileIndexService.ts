/**
 * 文件索引服务 — 记录本机重要文件的位置（只读，绝不移动/复制/删除用户文件）。
 */
import { randomUUID } from 'crypto'
import { statSync } from 'fs'
import { basename, extname } from 'path'
import type { DB } from '@database/connection'
import type { FileIndexItem, FileCheckResult } from '@shared/types'
import { nowIso } from '@shared/datetime'

export interface FileRow {
  id: string
  name: string
  path: string
  file_type: string
  size: number | null
  version: string
  notes: string
  tags: string
  last_checked_at: string | null
  is_invalid: number
  created_at: string
  updated_at: string
}

export function rowToItem(r: FileRow): FileIndexItem {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(r.tags)
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string')
  } catch {
    tags = []
  }
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    fileType: r.file_type,
    size: r.size,
    version: r.version,
    notes: r.notes,
    tags,
    lastCheckedAt: r.last_checked_at,
    isInvalid: !!r.is_invalid,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export interface FileFilter {
  search?: string
  fileType?: string | 'all'
  tag?: string
}

export function listFiles(db: DB, filter: FileFilter): FileIndexItem[] {
  const params: unknown[] = []
  let where = 'WHERE 1=1'
  if (filter.search && filter.search.trim()) {
    where += ` AND (name LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')`
    const like = `%${filter.search.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`
    params.push(like, like, like)
  }
  if (filter.fileType && filter.fileType !== 'all') {
    where += ` AND file_type = ?`
    params.push(filter.fileType)
  }
  let rows = db
    .prepare(`SELECT * FROM file_index ${where} ORDER BY created_at DESC`)
    .all(...params) as FileRow[]
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
  return rows.map(rowToItem)
}

export interface StatInfo {
  exists: boolean
  name: string | null
  fileType: string | null
  size: number | null
  isDirectory: boolean
}

/** 只读 stat：自动读取文件名 / 类型 / 大小 */
export function statPath(path: string): StatInfo {
  try {
    const st = statSync(path)
    if (!st.isFile()) return { exists: true, name: null, fileType: null, size: null, isDirectory: true }
    const ext = extname(path).replace(/^\./, '').toLowerCase()
    return {
      exists: true,
      name: basename(path),
      fileType: ext || 'file',
      size: st.size,
      isDirectory: false
    }
  } catch {
    return { exists: false, name: basename(path) || null, fileType: null, size: null, isDirectory: false }
  }
}

export function createFileIndex(
  db: DB,
  input: { path: string; name?: string; version?: string; notes?: string; tags?: string[] }
): FileIndexItem {
  const info = statPath(input.path)
  if (info.isDirectory) throw new Error('该路径是文件夹而不是文件')
  const now = nowIso()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO file_index (id, name, path, file_type, size, version, notes, tags, last_checked_at, is_invalid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name ?? info.name ?? input.path,
    input.path,
    info.fileType ?? '',
    info.size,
    input.version ?? '',
    input.notes ?? '',
    JSON.stringify(input.tags ?? []),
    info.exists ? now : null,
    info.exists ? 0 : 1,
    now,
    now
  )
  return getFileIndexItem(db, id)
}

export function getFileIndexItem(db: DB, id: string): FileIndexItem {
  const row = db.prepare(`SELECT * FROM file_index WHERE id = ?`).get(id) as FileRow | undefined
  if (!row) throw new Error('文件索引记录不存在')
  return rowToItem(row)
}

export function updateFileIndex(
  db: DB,
  id: string,
  patch: { name?: string; path?: string; version?: string | null; notes?: string; tags?: string[]; isInvalid?: boolean }
): FileIndexItem {
  const existing = getFileIndexItem(db, id)
  const next = {
    name: patch.name ?? existing.name,
    path: patch.path ?? existing.path,
    version: patch.version !== undefined ? patch.version : existing.version,
    notes: patch.notes ?? existing.notes,
    tags: patch.tags ?? existing.tags,
    isInvalid: patch.isInvalid !== undefined ? patch.isInvalid : existing.isInvalid
  }
  db.prepare(
    `UPDATE file_index SET name=?, path=?, version=?, notes=?, tags=?, is_invalid=?, updated_at=? WHERE id=?`
  ).run(next.name, next.path, next.version, next.notes, JSON.stringify(next.tags), next.isInvalid ? 1 : 0, nowIso(), id)
  return getFileIndexItem(db, id)
}

export function deleteFileIndex(db: DB, id: string): void {
  const res = db.prepare(`DELETE FROM file_index WHERE id = ?`).run(id)
  if (res.changes === 0) throw new Error('文件索引记录不存在')
}

/** 检查路径有效性并更新最近检查时间 / 失效标记 */
export function checkFile(db: DB, id: string): { item: FileIndexItem; result: FileCheckResult } {
  const existing = getFileIndexItem(db, id)
  const info = statPath(existing.path)
  const now = nowIso()
  const result: FileCheckResult = { exists: info.exists, size: info.size, checkedAt: now }
  db.prepare(`UPDATE file_index SET last_checked_at=?, is_invalid=?, size=?, updated_at=? WHERE id=?`).run(
    now,
    info.exists && !info.isDirectory ? 0 : 1,
    info.size,
    now,
    id
  )
  return { item: getFileIndexItem(db, id), result }
}

export function allFileTypes(db: DB): string[] {
  const rows = db.prepare(`SELECT DISTINCT file_type FROM file_index WHERE file_type != ''`).all() as {
    file_type: string
  }[]
  return rows.map((r) => r.file_type).sort()
}

// ---------- 批量操作（阶段二） ----------

export interface BatchAddResult {
  added: FileIndexItem[]
  failed: Array<{ path: string; reason: string }>
}

/** 批量添加文件路径（跳过目录与重复路径），只读 stat，不动文件 */
export function createManyFileIndex(
  db: DB,
  paths: string[]
): BatchAddResult {
  const result: BatchAddResult = { added: [], failed: [] }
  const existing = new Set(
    (db.prepare(`SELECT path FROM file_index`).all() as Array<{ path: string }>).map((r) => r.path.toLowerCase())
  )
  for (const path of paths) {
    try {
      const info = statPath(path)
      if (info.isDirectory) {
        result.failed.push({ path, reason: '该路径是文件夹而不是文件' })
        continue
      }
      if (!info.exists) {
        result.failed.push({ path, reason: '路径不存在' })
        continue
      }
      if (existing.has(path.toLowerCase())) {
        result.failed.push({ path, reason: '该文件已在索引中' })
        continue
      }
      existing.add(path.toLowerCase())
      result.added.push(createFileIndex(db, { path }))
    } catch (err) {
      result.failed.push({ path, reason: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

export interface BatchCheckProgress {
  checked: number
  total: number
  valid: number
  invalid: number
  current: string
}

/** 按选中 ID 取文件索引（保持传入顺序），用于批量导出 */
export function getFileByIds(db: DB, ids: string[]): FileIndexItem[] {
  const stmt = db.prepare(`SELECT * FROM file_index WHERE id = ?`)
  const out: FileIndexItem[] = []
  for (const id of ids) {
    const row = stmt.get(id) as FileRow | undefined
    if (row) out.push(rowToItem(row))
  }
  return out
}

/** 目录分组键：取路径的父目录 */
export function parentDir(path: string): string {
  const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return idx > 0 ? path.slice(0, idx) : path
}
