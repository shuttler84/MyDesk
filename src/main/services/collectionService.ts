/**
 * 收藏服务 — 灵感收藏库业务逻辑（平台无关）。
 */
import { randomUUID } from 'crypto'
import type { DB } from '@database/connection'
import type { Collection, CollectionInput, CollectionType, Priority, ResearchStatus } from '@shared/types'
import { nowIso } from '@shared/datetime'

export interface CollectionRow {
  id: string
  name: string
  url: string
  type: CollectionType
  description: string
  note: string
  tags: string
  importance: Priority
  research_status: ResearchStatus
  favicon: string | null
  preview_image: string | null
  created_at: string
  updated_at: string
}

export function rowToCollection(r: CollectionRow): Collection {
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
    url: r.url,
    type: r.type,
    description: r.description,
    note: r.note,
    tags,
    importance: r.importance,
    researchStatus: r.research_status,
    favicon: r.favicon,
    previewImage: r.preview_image,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export interface CollectionFilter {
  type?: CollectionType | 'all'
  tags?: string[]
  status?: ResearchStatus | 'all'
  search?: string
}

export function listCollections(db: DB, filter: CollectionFilter): Collection[] {
  const params: unknown[] = []
  let where = 'WHERE 1=1'

  if (filter.type && filter.type !== 'all') {
    where += ` AND type = ?`
    params.push(filter.type)
  }
  if (filter.status && filter.status !== 'all') {
    where += ` AND research_status = ?`
    params.push(filter.status)
  }
  if (filter.search && filter.search.trim()) {
    where += ` AND (name LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\')`
    const like = `%${filter.search.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`
    params.push(like, like, like, like)
  }

  let rows = db
    .prepare(`SELECT * FROM collections ${where} ORDER BY created_at DESC`)
    .all(...params) as CollectionRow[]

  if (filter.tags && filter.tags.length > 0) {
    rows = rows.filter((r) => {
      let tags: string[] = []
      try {
        const parsed = JSON.parse(r.tags)
        if (Array.isArray(parsed)) tags = parsed
      } catch {
        /* ignore */
      }
      return filter.tags!.every((t) => tags.includes(t))
    })
  }

  return rows.map(rowToCollection)
}

/** 收藏重复检测：返回同 URL 的已有记录（如有） */
export function findByUrl(db: DB, url: string): Collection | null {
  const row = db
    .prepare(`SELECT * FROM collections WHERE url = ? ORDER BY created_at LIMIT 1`)
    .get(url) as CollectionRow | undefined
  return row ? rowToCollection(row) : null
}

export function createCollection(db: DB, input: CollectionInput): Collection {
  const now = nowIso()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO collections (id, name, url, type, description, note, tags, importance, research_status, favicon, preview_image, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.url,
    input.type ?? 'website',
    input.description ?? '',
    input.note ?? '',
    JSON.stringify(input.tags ?? []),
    input.importance ?? 'medium',
    input.researchStatus ?? 'unresearched',
    null,
    null,
    now,
    now
  )
  return getCollection(db, id)
}

export function getCollection(db: DB, id: string): Collection {
  const row = db.prepare(`SELECT * FROM collections WHERE id = ?`).get(id) as CollectionRow | undefined
  if (!row) throw new Error('收藏不存在')
  return rowToCollection(row)
}

export function updateCollection(
  db: DB,
  id: string,
  patch: Partial<CollectionInput> & { favicon?: string | null; previewImage?: string | null }
): Collection {
  const existing = getCollection(db, id)
  const next = {
    name: patch.name ?? existing.name,
    url: patch.url ?? existing.url,
    type: patch.type ?? existing.type,
    description: patch.description ?? existing.description,
    note: patch.note ?? existing.note,
    tags: patch.tags ?? existing.tags,
    importance: patch.importance ?? existing.importance,
    researchStatus: patch.researchStatus ?? existing.researchStatus,
    favicon: patch.favicon !== undefined ? patch.favicon : existing.favicon,
    previewImage: patch.previewImage !== undefined ? patch.previewImage : existing.previewImage
  }
  db.prepare(
    `UPDATE collections SET name=?, url=?, type=?, description=?, note=?, tags=?, importance=?, research_status=?, favicon=?, preview_image=?, updated_at=?
     WHERE id=?`
  ).run(
    next.name,
    next.url,
    next.type,
    next.description,
    next.note,
    JSON.stringify(next.tags),
    next.importance,
    next.researchStatus,
    next.favicon,
    next.previewImage,
    nowIso(),
    id
  )
  return getCollection(db, id)
}

export function deleteCollection(db: DB, id: string): void {
  const res = db.prepare(`DELETE FROM collections WHERE id = ?`).run(id)
  if (res.changes === 0) throw new Error('收藏不存在')
}

export function allTags(db: DB): string[] {
  const rows = db.prepare(`SELECT tags FROM collections`).all() as { tags: string }[]
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

// ---------- 批量操作（阶段二） ----------

/** 批量删除收藏，返回实际删除数量 */
export function deleteManyCollections(db: DB, ids: string[]): number {
  const stmt = db.prepare(`DELETE FROM collections WHERE id = ?`)
  let n = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const id of ids) {
      n += Number(stmt.run(id).changes)
    }
    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
  return n
}

/** 批量修改标签：replace 替换全部；add 追加（去重） */
export function setManyTags(db: DB, ids: string[], mode: 'replace' | 'add', tags: string[]): number {
  const get = db.prepare(`SELECT tags FROM collections WHERE id = ?`)
  const upd = db.prepare(`UPDATE collections SET tags = ?, updated_at = ? WHERE id = ?`)
  const now = nowIso()
  let n = 0
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const id of ids) {
      const row = get.get(id) as { tags: string } | undefined
      if (!row) continue
      let current: string[] = []
      try {
        const parsed = JSON.parse(row.tags)
        if (Array.isArray(parsed)) current = parsed.filter((t) => typeof t === 'string')
      } catch {
        current = []
      }
      const next =
        mode === 'replace' ? [...tags] : [...new Set([...current, ...tags])]
      n += Number(upd.run(JSON.stringify(next), now, id).changes)
    }
    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
  return n
}

/** 按选中 ID 取收藏（保持传入顺序），用于批量导出 */
export function getByIds(db: DB, ids: string[]): Collection[] {
  const stmt = db.prepare(`SELECT * FROM collections WHERE id = ?`)
  const out: Collection[] = []
  for (const id of ids) {
    const row = stmt.get(id) as CollectionRow | undefined
    if (row) out.push(rowToCollection(row))
  }
  return out
}
