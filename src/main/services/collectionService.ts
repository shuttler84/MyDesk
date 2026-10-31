/**
 * 收藏服务 — 灵感收藏库业务逻辑（平台无关）。
 */
import { randomUUID } from 'crypto'
import type { DB } from '@database/connection'
import type {
  Collection,
  CollectionGroup,
  CollectionHistoryEntry,
  CollectionInput,
  CollectionStats,
  CollectionType,
  Priority,
  ResearchStatus
} from '@shared/types'
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
  group_id: string | null
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
    groupId: r.group_id ?? null,
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
    `INSERT INTO collections (id, name, url, type, description, note, tags, importance, research_status, favicon, preview_image, group_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    (input as { groupId?: string | null }).groupId ?? null,
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

/** 阶段三 collectionService 追加代码 —— 脚本插入用 */

export function updateCollection(
  db: DB,
  id: string,
  patch: Partial<CollectionInput> & { favicon?: string | null; previewImage?: string | null; groupId?: string | null }
): Collection {
  const existing = getCollection(db, id)
  // 修改历史：写入修改前的完整快照（V3）
  db.prepare(`INSERT INTO collection_history (id, collection_id, changed_at, snapshot) VALUES (?, ?, ?, ?)`).run(
    randomUUID(),
    id,
    nowIso(),
    JSON.stringify(existing)
  )
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
    previewImage: patch.previewImage !== undefined ? patch.previewImage : existing.previewImage,
    groupId: patch.groupId !== undefined ? patch.groupId : existing.groupId
  }
  db.prepare(
    `UPDATE collections SET name=?, url=?, type=?, description=?, note=?, tags=?, importance=?, research_status=?, favicon=?, preview_image=?, group_id=?, updated_at=?
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
    next.groupId,
    nowIso(),
    id
  )
  return getCollection(db, id)
}

// ---------- 阶段三：分组 / 排序 / 筛选 / 统计 / 历史 ----------

/** 按分组筛选：'all' = 全部，null = 未分组 */
export function filterByGroup(list: Collection[], groupId: string | null | 'all'): Collection[] {
  if (groupId === 'all' || groupId === undefined) return list
  return list.filter((c) => c.groupId === groupId)
}

/** 高级排序 */
export function sortCollections(list: Collection[], sortBy: string): Collection[] {
  const importanceRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const sorted = [...list]
  switch (sortBy) {
    case 'created_asc':
      return sorted.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    case 'updated_desc':
      return sorted.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
    case 'name_asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    case 'importance':
      return sorted.sort(
        (a, b) => importanceRank[a.importance] - importanceRank[b.importance] || (a.createdAt < b.createdAt ? 1 : -1)
      )
    case 'created_desc':
    default:
      return sorted.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
  }
}

/** 标签组合筛选：and=同时包含全部，or=包含任一 */
export function filterByTagsMode(list: Collection[], tags: string[], mode: 'and' | 'or'): Collection[] {
  if (tags.length === 0) return list
  return list.filter((c) =>
    mode === 'and' ? tags.every((t) => c.tags.includes(t)) : tags.some((t) => c.tags.includes(t))
  )
}

/** 重复 URL 清单 */
export function findDuplicateUrls(db: DB): Array<{ url: string; count: number }> {
  const rows = db
    .prepare(`SELECT url, COUNT(*) AS c FROM collections GROUP BY url HAVING c >= 2 ORDER BY c DESC, url`)
    .all() as Array<{ url: string; c: number }>
  return rows.map((r) => ({ url: r.url, count: Number(r.c) }))
}

/** 相似收藏提醒：同域名条目数 */
export function findSimilarCollections(db: DB): Array<{ host: string; count: number }> {
  const rows = db.prepare(`SELECT url FROM collections`).all() as Array<{ url: string }>
  const hosts = new Map<string, number>()
  for (const r of rows) {
    try {
      const u = new URL(r.url)
      const key = u.hostname.replace(/^www\./, '')
      hosts.set(key, (hosts.get(key) ?? 0) + 1)
    } catch {
      /* ignore */
    }
  }
  return [...hosts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
}

/** 收藏数据统计 */
export function collectionStats(db: DB): CollectionStats {
  const total = Number((db.prepare(`SELECT COUNT(*) AS c FROM collections`).get() as { c: number }).c)
  const byType = (
    db.prepare(`SELECT type, COUNT(*) AS c FROM collections GROUP BY type ORDER BY c DESC`).all() as Array<{
      type: string
      c: number
    }>
  ).map((r) => ({ type: r.type, count: Number(r.c) }))
  const byStatus = (
    db
      .prepare(`SELECT research_status AS status, COUNT(*) AS c FROM collections GROUP BY research_status`)
      .all() as Array<{ status: string; c: number }>
  ).map((r) => ({ status: r.status, count: Number(r.c) }))
  const tagRows = db.prepare(`SELECT tags FROM collections`).all() as Array<{ tags: string }>
  const tagCount = new Map<string, number>()
  for (const r of tagRows) {
    try {
      const parsed = JSON.parse(r.tags)
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (typeof t === 'string') tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
        }
      }
    } catch {
      /* ignore */
    }
  }
  const topTags = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
  return { total, byType, byStatus, topTags, duplicates: findDuplicateUrls(db) }
}

/** 收藏修改历史（倒序） */
export function getCollectionHistory(db: DB, collectionId: string, limit = 50): CollectionHistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT id, collection_id, changed_at, snapshot FROM collection_history
       WHERE collection_id = ? ORDER BY changed_at DESC, rowid DESC LIMIT ?`
    )
    .all(collectionId, limit) as Array<{ id: string; collection_id: string; changed_at: string; snapshot: string }>
  return rows.map((r) => ({
    id: r.id,
    collectionId: r.collection_id,
    changedAt: r.changed_at,
    snapshot: JSON.parse(r.snapshot) as Collection
  }))
}

export function listGroups(db: DB): CollectionGroup[] {
  const rows = db
    .prepare(`SELECT * FROM collection_groups ORDER BY sort_order ASC, created_at ASC`)
    .all() as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    sortOrder: Number(r.sort_order),
    createdAt: String(r.created_at)
  }))
}

export function createGroup(db: DB, name: string): CollectionGroup {
  const id = randomUUID()
  const createdAt = nowIso()
  db.prepare(`INSERT INTO collection_groups (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)`).run(
    id,
    name,
    Date.now(),
    createdAt
  )
  return { id, name, sortOrder: Date.now(), createdAt }
}

export function updateGroup(db: DB, id: string, patch: { name?: string; sortOrder?: number }): void {
  const existing = db.prepare(`SELECT * FROM collection_groups WHERE id = ?`).get(id) as
    | { name: string; sort_order: number }
    | undefined
  if (!existing) throw new Error('分组不存在')
  db.prepare(`UPDATE collection_groups SET name = ?, sort_order = ? WHERE id = ?`).run(
    patch.name ?? existing.name,
    patch.sortOrder ?? existing.sort_order,
    id
  )
}

/** 删除分组：组内收藏变为未分组（ON DELETE SET NULL） */
export function deleteGroup(db: DB, id: string): void {
  const res = db.prepare(`DELETE FROM collection_groups WHERE id = ?`).run(id)
  if (Number(res.changes) === 0) throw new Error('分组不存在')
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
