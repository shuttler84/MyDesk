/**
 * Dashboard 首页数据聚合（全部来自真实数据，无虚构内容）。
 */
import type { DB } from '@database/connection'
import type { DashboardStats } from '@shared/types'
import { localDateStr, weekdayName } from '@shared/datetime'
import { rowToTask, type TaskRow } from './taskService'
import { rowToCollection, type CollectionRow } from './collectionService'
import { rowToItem, type FileRow } from './fileIndexService'
import { rowToNote, type NoteRow } from './noteService'

function count(db: DB, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { c: number | bigint }
  return Number(row.c)
}

export function dashboardStats(db: DB): DashboardStats {
  const today = localDateStr()

  const tasksDone = count(
    db,
    `SELECT COUNT(*) AS c FROM tasks WHERE completed = 1 AND substr(completed_at, 1, 10) = ?`,
    today
  )
  // 今日任务总量：今天完成的 + 仍未完成的（含无截止日期与逾期延续）
  const openTotal = count(
    db,
    `SELECT COUNT(*) AS c FROM tasks WHERE completed = 0 AND (due_date IS NULL OR due_date <= ?)`,
    today
  )
  const tasksTotal = tasksDone + openTotal

  const importantTasks = (
    db
      .prepare(
        `SELECT * FROM tasks WHERE is_important = 1 AND completed = 0
         ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date IS NULL, due_date
         LIMIT 5`
      )
      .all() as unknown as TaskRow[]
  ).map(rowToTask)

  const recentCollections = (
    db
      .prepare(`SELECT * FROM collections ORDER BY created_at DESC LIMIT 4`)
      .all() as unknown as CollectionRow[]
  ).map(rowToCollection)

  const recentFiles = (
    db
      .prepare(`SELECT * FROM file_index ORDER BY created_at DESC LIMIT 4`)
      .all() as unknown as FileRow[]
  ).map(rowToItem)

  const recentNotes = (
    db
      .prepare(`SELECT * FROM notes ORDER BY updated_at DESC LIMIT 4`)
      .all() as unknown as NoteRow[]
  ).map(rowToNote)

  return {
    date: today,
    weekday: weekdayName(),
    tasksTotal,
    tasksDone,
    collectionCount: count(db, `SELECT COUNT(*) AS c FROM collections`),
    fileCount: count(db, `SELECT COUNT(*) AS c FROM file_index`),
    noteCount: count(db, `SELECT COUNT(*) AS c FROM notes`),
    importantTasks,
    recentCollections,
    recentFiles,
    recentNotes
  }
}
