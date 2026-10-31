/**
 * 任务服务 — 任务管理模块的业务逻辑（平台无关）。
 *
 * 跨日规则（明确声明，避免重复生成或丢失）：
 * - 未完成任务不做任何数据移动/复制。
 * - "今日"视图 = 未完成 且 (due_date 为空 或 due_date <= 今天)，逾期任务自动延续显示。
 * - "未来计划" = 未完成 且 due_date > 今天。
 * - 重要事项在列表中置顶。
 */
import { randomUUID } from 'crypto'
import type { DB } from '@database/connection'
import type { Task, TaskInput, TaskFilter, Priority } from '@shared/types'
import { localDateStr, nowIso } from '@shared/datetime'
import { withTransaction } from '@database/connection'

export interface TaskRow {
  id: string
  title: string
  notes: string
  priority: Priority
  due_date: string | null
  due_time: string | null
  completed: number
  completed_at: string | null
  is_important: number
  sort_order: number
  created_at: string
  updated_at: string
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    priority: r.priority,
    dueDate: r.due_date,
    dueTime: r.due_time,
    completed: !!r.completed,
    completedAt: r.completed_at,
    isImportant: !!r.is_important,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listTasks(db: DB, filter: TaskFilter): Task[] {
  const today = localDateStr()
  const params: unknown[] = []
  let where = 'WHERE 1=1'

  switch (filter.view) {
    case 'today':
      where += ` AND completed = 0 AND (due_date IS NULL OR due_date <= ?)`
      params.push(today)
      break
    case 'upcoming':
      where += ` AND completed = 0 AND due_date IS NOT NULL AND due_date > ?`
      params.push(today)
      break
    case 'completed':
      where += ` AND completed = 1`
      break
    case 'all':
      break
  }

  if (filter.priority && filter.priority !== 'all') {
    where += ` AND priority = ?`
    params.push(filter.priority)
  }
  if (filter.date) {
    where += ` AND due_date = ?`
    params.push(filter.date)
  }
  if (filter.search && filter.search.trim()) {
    where += ` AND (title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')`
    const like = `%${filter.search.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`
    params.push(like, like)
  }

  const order =
    filter.view === 'completed'
      ? `ORDER BY completed_at DESC`
      : `ORDER BY is_important DESC, sort_order ASC, created_at ASC`

  const rows = db
    .prepare(`SELECT * FROM tasks ${where} ${order}`)
    .all(...params) as TaskRow[]
  return rows.map(rowToTask)
}

export function createTask(db: DB, input: TaskInput): Task {
  const now = nowIso()
  const id = randomUUID()
  const minOrder = db.prepare(`SELECT MIN(sort_order) AS m FROM tasks`).get() as { m: number | null }
  const sortOrder = (minOrder.m ?? 0) - 1

  db.prepare(
    `INSERT INTO tasks (id, title, notes, priority, due_date, due_time, is_important, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.title,
    input.notes ?? '',
    input.priority ?? 'medium',
    input.dueDate ?? null,
    input.dueTime ?? null,
    input.isImportant ? 1 : 0,
    sortOrder,
    now,
    now
  )
  return getTask(db, id)
}

export function getTask(db: DB, id: string): Task {
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined
  if (!row) throw new Error('任务不存在')
  return rowToTask(row)
}

export function updateTask(db: DB, id: string, patch: Partial<TaskInput> & { completed?: boolean }): Task {
  const existing = getTask(db, id)
  const next: Task = {
    ...existing,
    title: patch.title ?? existing.title,
    notes: patch.notes ?? existing.notes,
    priority: patch.priority ?? existing.priority,
    dueDate: patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
    dueTime: patch.dueTime !== undefined ? patch.dueTime : existing.dueTime,
    isImportant: patch.isImportant !== undefined ? patch.isImportant : existing.isImportant,
    updatedAt: nowIso()
  }
  if (patch.completed !== undefined) {
    next.completed = patch.completed
    next.completedAt = patch.completed ? nowIso() : null
  }
  db.prepare(
    `UPDATE tasks SET title=?, notes=?, priority=?, due_date=?, due_time=?, completed=?, completed_at=?, is_important=?, updated_at=?
     WHERE id=?`
  ).run(
    next.title,
    next.notes,
    next.priority,
    next.dueDate,
    next.dueTime,
    next.completed ? 1 : 0,
    next.completedAt,
    next.isImportant ? 1 : 0,
    next.updatedAt,
    id
  )
  return getTask(db, id)
}

export function toggleTask(db: DB, id: string): Task {
  const existing = getTask(db, id)
  return updateTask(db, id, { completed: !existing.completed })
}

export function deleteTask(db: DB, id: string): void {
  const res = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id)
  if (res.changes === 0) throw new Error('任务不存在')
}

/** 拖拽排序持久化：按给定顺序重新赋 sort_order */
export function reorderTasks(db: DB, ids: string[]): void {
  const stmt = db.prepare(`UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?`)
  const now = nowIso()
  withTransaction(db, () => {
    ids.forEach((id, i) => stmt.run(i + 1, now, id))
  })
}
