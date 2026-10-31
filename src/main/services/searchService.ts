/**
 * 全局搜索（阶段二增强版）。
 *
 * 覆盖范围（任务书第二节）：
 * - 任务名称和备注
 * - 收藏名称、URL、描述、个人备注、标签
 * - 文件名称、路径、备注
 * - 笔记标题、正文
 *
 * 保险箱永远不在搜索范围内（锁定/解锁均不包含）——独立安全边界。
 * 返回结果带 matchStart/matchLength，供渲染层做关键词高亮。
 */
import type { DB } from '@database/connection'
import type { GlobalSearchResult } from '@shared/types'

export type SearchModule = 'tasks' | 'collections' | 'files' | 'notes'

export interface SearchResultItem extends GlobalSearchResult {
  /** 关键词在 title 中的位置（用于高亮），-1 表示不在标题中 */
  matchStart: number
  matchLength: number
}

function like(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`
}

function bestMatch(title: string, q: string): { start: number; length: number } {
  const idx = title.toLowerCase().indexOf(q.toLowerCase())
  return idx >= 0 ? { start: idx, length: q.length } : { start: -1, length: 0 }
}

export function globalSearch(db: DB, query: string): SearchResultItem[] {
  const q = query.trim()
  if (!q) return []
  const pat = like(q)
  const results: SearchResultItem[] = []
  const push = (module: SearchModule, id: string, title: string, snippet: string) => {
    const m = bestMatch(title, q)
    results.push({ module, id, title, snippet, matchStart: m.start, matchLength: m.length })
  }

  const tasks = db
    .prepare(
      `SELECT id, title, notes FROM tasks WHERE title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' LIMIT 10`
    )
    .all(pat, pat) as Array<{ id: string; title: string; notes: string }>
  for (const t of tasks) {
    push('tasks', t.id, t.title, t.notes.slice(0, 120))
  }

  const collections = db
    .prepare(
      `SELECT id, name, url, description, note, tags FROM collections
       WHERE name LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
          OR note LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\'
       LIMIT 10`
    )
    .all(pat, pat, pat, pat, pat) as Array<{
    id: string
    name: string
    url: string
    description: string
    note: string
    tags: string
  }>
  for (const c of collections) {
    push('collections', c.id, c.name, c.url)
  }

  const files = db
    .prepare(
      `SELECT id, name, path, notes FROM file_index
       WHERE name LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'
       LIMIT 10`
    )
    .all(pat, pat, pat) as Array<{ id: string; name: string; path: string; notes: string }>
  for (const f of files) {
    push('files', f.id, f.name, f.path)
  }

  const notes = db
    .prepare(
      `SELECT id, title, content FROM notes WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' LIMIT 10`
    )
    .all(pat, pat) as Array<{ id: string; title: string; content: string }>
  for (const n of notes) {
    push('notes', n.id, n.title || '（无标题）', n.content.slice(0, 120))
  }

  return results
}
