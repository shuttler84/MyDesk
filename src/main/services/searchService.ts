/**
 * 全局搜索。普通搜索永远不触达保险箱数据（锁定或解锁均不包含）。
 */
import type { DB } from '@database/connection'
import type { GlobalSearchResult } from '@shared/types'

function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`
}

export function globalSearch(db: DB, query: string): GlobalSearchResult[] {
  const q = query.trim()
  if (!q) return []
  const pat = like(q)
  const results: GlobalSearchResult[] = []

  const tasks = db
    .prepare(
      `SELECT id, title, notes FROM tasks WHERE title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' LIMIT 8`
    )
    .all(pat, pat) as Array<{ id: string; title: string; notes: string }>
  for (const t of tasks) {
    results.push({
      module: 'tasks',
      id: t.id,
      title: t.title,
      snippet: t.notes.slice(0, 120)
    })
  }

  const collections = db
    .prepare(
      `SELECT id, name, url, description FROM collections
       WHERE name LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' LIMIT 8`
    )
    .all(pat, pat, pat) as Array<{ id: string; name: string; url: string; description: string }>
  for (const c of collections) {
    results.push({ module: 'collections', id: c.id, title: c.name, snippet: c.url })
  }

  const files = db
    .prepare(
      `SELECT id, name, path FROM file_index WHERE name LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' LIMIT 8`
    )
    .all(pat, pat) as Array<{ id: string; name: string; path: string }>
  for (const f of files) {
    results.push({ module: 'files', id: f.id, title: f.name, snippet: f.path })
  }

  const notes = db
    .prepare(
      `SELECT id, title, content FROM notes WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' LIMIT 8`
    )
    .all(pat, pat) as Array<{ id: string; title: string; content: string }>
  for (const n of notes) {
    results.push({ module: 'notes', id: n.id, title: n.title || '(untitled)', snippet: n.content.slice(0, 120) })
  }

  return results
}
