/**
 * 文件索引服务 — 记录本机重要文件的位置（只读，绝不移动/复制/删除用户文件）。
 */
import { randomUUID } from 'crypto'
import { statSync, readdirSync, readFileSync } from 'fs'
import { basename, extname, join } from 'path'
import type { DB } from '@database/connection'
import type { FileIndexItem, FileCheckResult, FileIndexStats, ScanOptions } from '@shared/types'
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
  origin_device: string
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
    originDevice: r.origin_device ?? 'windows',
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


// ---------- 阶段三：统计 / 批量导入 / 目录扫描 / 失效清理 ----------

/** 文件索引统计（类型分布、总大小、失效、重复路径、最近添加） */
export function fileIndexStats(db: DB): FileIndexStats {
  const rows = db.prepare(`SELECT * FROM file_index`).all() as unknown as FileRow[]
  const items = rows.map(rowToItem)
  const totalSize = items.reduce((sum, f) => sum + (f.size ?? 0), 0)
  const invalidCount = items.filter((f) => f.isInvalid).length
  const typeMap = new Map<string, { count: number; size: number }>()
  for (const f of items) {
    const key = f.fileType || '其他'
    const cur = typeMap.get(key) ?? { count: 0, size: 0 }
    typeMap.set(key, { count: cur.count + 1, size: cur.size + (f.size ?? 0) })
  }
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()
  const recentAdded = items.filter((f) => f.createdAt >= weekAgo).length
  const pathCount = new Map<string, number>()
  for (const f of items) pathCount.set(f.path.toLowerCase(), (pathCount.get(f.path.toLowerCase()) ?? 0) + 1)
  const duplicatePaths = [...pathCount.entries()].filter(([, c]) => c >= 2).map(([p]) => p)
  return {
    total: items.length,
    totalSize,
    invalidCount,
    byType: [...typeMap.entries()]
      .map(([fileType, v]) => ({ fileType, count: v.count, size: v.size }))
      .sort((a, b) => b.count - a.count),
    recentAdded,
    duplicatePaths
  }
}

export interface CsvImportResult {
  imported: number
  skipped: number
  errors: Array<{ line: number; reason: string }>
}

/**
 * 从 CSV 批量导入文件索引（第一阶段导出格式兼容）。
 * 表头：name,path,fileType,size,version,tags,isInvalid,notes,createdAt（至少需要 path 列）。
 */
export function importFileIndexCsv(db: DB, csvPath: string): CsvImportResult {
  const raw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '')
  const result: CsvImportResult = { imported: 0, skipped: 0, errors: [] }
  if (lines.length === 0) return result

  // 解析 CSV（支持引号转义）
  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuote) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else inQuote = false
        } else cur += ch
      } else if (ch === '"') inQuote = true
      else if (ch === ',') {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out
  }

  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase())
  const pathIdx = header.indexOf('path')
  if (pathIdx === -1) {
    result.errors.push({ line: 1, reason: 'CSV 缺少 path 列' })
    return result
  }
  const idx = (name: string): number => header.indexOf(name)
  const existing = new Set(
    (db.prepare(`SELECT path FROM file_index`).all() as Array<{ path: string }>).map((r) => r.path.toLowerCase())
  )

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i])
    const path = (cells[pathIdx] ?? '').trim()
    if (!path) {
      result.skipped++
      continue
    }
    if (existing.has(path.toLowerCase())) {
      result.skipped++
      continue
    }
    try {
      const info = statPath(path)
      const tags = (cells[idx('tags')] ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean)
      const id = randomUUID()
      const now = nowIso()
      const size =
        cells[idx('size')] && !Number.isNaN(Number(cells[idx('size')])) ? Number(cells[idx('size')]) : info.size
      db.prepare(
        `INSERT INTO file_index (id, name, path, file_type, size, version, notes, tags, last_checked_at, is_invalid, origin_device, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'windows', ?, ?)`
      ).run(
        id,
        (cells[idx('name')] ?? '').trim() || info.name || path,
        path,
        info.fileType ?? (cells[idx('filetype')] ?? '').trim(),
        size,
        (cells[idx('version')] ?? '').trim(),
        (cells[idx('notes')] ?? '').trim(),
        JSON.stringify(tags),
        info.exists ? now : null,
        info.exists ? 0 : 1,
        now,
        now
      )
      existing.add(path.toLowerCase())
      result.imported++
    } catch (err) {
      result.errors.push({ line: i + 1, reason: err instanceof Error ? err.message : String(err) })
    }
  }
  return result
}

export interface ScanHandle {
  id: string
  cancel: () => void
}

const activeScans = new Map<string, { cancelled: boolean }>()

/** 取消进行中的扫描 */
export function cancelScan(scanId: string): void {
  const handle = activeScans.get(scanId)
  if (handle) handle.cancelled = true
}

/**
 * 目录扫描（阶段三，可选功能）：
 * 必须由用户主动发起；递归深度/扩展名/数量上限由参数限制；支持取消。
 * 只读取目录元信息，绝不修改用户文件。
 */
export function scanDirectory(
  db: DB | null,
  options: ScanOptions,
  onProgress?: (scanned: number, matched: number, currentDir: string) => void
): { files: Array<{ path: string; name: string; fileType: string; size: number }>; cancelled: boolean } {
  // readdirSync/statSync/join 由合并时加入顶部 import
  const state = { cancelled: false }
  const scanId = randomUUID()
  activeScans.set(scanId, state)

  const exts = options.extensions.map((e) => (e.startsWith('.') ? e.toLowerCase() : '.' + e.toLowerCase()))
  const files: Array<{ path: string; name: string; fileType: string; size: number }> = []
  let scanned = 0

  const walk = (dir: string, depth: number): void => {
    if (state.cancelled || files.length >= options.maxFiles) return
    if (depth > options.maxDepth) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return // 无权限等，跳过
    }
    for (const name of entries) {
      if (state.cancelled || files.length >= options.maxFiles) return
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        onProgress?.(scanned, files.length, full)
        walk(full, depth + 1)
      } else if (st.isFile()) {
        scanned++
        const ext = extname(name).toLowerCase()
        if (exts.length === 0 || exts.includes(ext)) {
          files.push({
            path: full,
            name,
            fileType: ext.replace(/^\./, ''),
            size: st.size
          })
        }
        if (scanned % 50 === 0) onProgress?.(scanned, files.length, dir)
      }
    }
  }

  try {
    walk(options.directory, 0)
  } finally {
    activeScans.delete(scanId)
  }
  return { files, cancelled: state.cancelled }
}

/** 失效路径清理建议：返回失效条目（由用户确认后自行删除或更新） */
export function findInvalidEntries(db: DB): FileIndexItem[] {
  return listFiles(db, {}).filter((f) => f.isInvalid)
}


