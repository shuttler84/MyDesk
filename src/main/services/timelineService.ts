/**
 * 时间轴与统计服务。
 * 每日计数直接从业务表按本地日期聚合（无冗余记录，避免数据不一致）。
 * 活动列表来自 activity_log。年度热力图等增强统计在第三阶段完善。
 */
import type { DB } from '@database/connection'
import type {
  TimelineStats,
  DailyCount,
  TimelineActivity,
  MonthlyTaskStat,
  TypeDistribution,
  TagUsage
} from '@shared/types'
import { isoToLocalDate, localDateStr } from '@shared/datetime'

function dailyCounts(db: DB, sql: string, params: unknown[]): DailyCount[] {
  const rows = db.prepare(sql).all(...params) as Array<{ d: string; count: number }>
  return rows.map((r) => ({ date: r.d, count: Number(r.count) }))
}

export interface TimelineRange {
  /** YYYY-MM-DD，包含；null 表示不限 */
  from?: string | null
  to?: string | null
}

export function timelineStats(db: DB, range: TimelineRange): TimelineStats {
  const from = range.from || '0000-01-01'
  const to = range.to || '9999-12-31'

  const tasks = dailyCounts(
    db,
    `SELECT substr(completed_at, 1, 10) AS d, COUNT(*) AS count
     FROM tasks WHERE completed = 1 AND completed_at IS NOT NULL
       AND date(completed_at) BETWEEN date(?) AND date(?)
     GROUP BY d ORDER BY d`,
    [from, to]
  )
  // 注意：completed_at 为 UTC ISO；统计以 UTC 日期聚合（与创建/完成时刻一一对应，不做时区平移，
  // 避免跨时区迁移时重复或丢失计数）。
  const collections = dailyCounts(
    db,
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS count
     FROM collections WHERE date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY d ORDER BY d`,
    [from, to]
  )
  const notes = dailyCounts(
    db,
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS count
     FROM notes WHERE date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY d ORDER BY d`,
    [from, to]
  )
  const files = dailyCounts(
    db,
    `SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS count
     FROM file_index WHERE date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY d ORDER BY d`,
    [from, to]
  )

  const activities = db
    .prepare(
      `SELECT id, type, ref_id, title, created_at FROM activity_log
       WHERE date(created_at) BETWEEN date(?) AND date(?)
       ORDER BY created_at DESC LIMIT 200`
    )
    .all(from, to) as Array<Record<string, unknown>>

  // ---- 阶段三扩展统计 ----
  const monthlyTasks = (
    db
      .prepare(
        `SELECT substr(completed_at, 1, 7) AS m, COUNT(*) AS c
         FROM tasks WHERE completed = 1 AND completed_at IS NOT NULL
           AND date(completed_at) BETWEEN date(?) AND date(?)
         GROUP BY m ORDER BY m`
      )
      .all(from, to) as Array<{ m: string; c: number }>
  ).map((r) => ({ month: r.m, completed: Number(r.c) }))

  const typeDistribution = (
    db.prepare(`SELECT type, COUNT(*) AS c FROM collections GROUP BY type ORDER BY c DESC`).all() as Array<{
      type: string
      c: number
    }>
  ).map((r) => ({ type: r.type, count: Number(r.c) }))

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
  const tagUsage: TagUsage[] = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)

  return {
    monthlyTasks,
    typeDistribution,
    tagUsage,
    tasks,
    collections,
    notes,
    files,
    activities: activities.map(
      (a): TimelineActivity => ({
        id: Number(a.id),
        type: String(a.type),
        refId: a.ref_id == null ? null : String(a.ref_id),
        title: String(a.title ?? ''),
        createdAt: String(a.created_at)
      })
    )
  }
}

/** 今日概览（Dashboard 用） */
export function todayCounts(db: DB): { tasksDone: number; tasksTotal: number } {
  const today = isoToLocalDate(new Date().toISOString())
  const done = db
    .prepare(
      `SELECT COUNT(*) AS c FROM tasks WHERE completed = 1 AND substr(completed_at, 1, 10) = ?`
    )
    .get(today) as { c: number }
  const totalRows = db
    .prepare(`SELECT COUNT(*) AS c FROM tasks WHERE completed = 1 OR due_date IS NULL OR due_date <= ?`)
    .get(today) as { c: number }
  return { tasksDone: Number(done.c), tasksTotal: Number(totalRows.c) }
}

export function emptyStatsGuard(): string {
  return localDateStr()
}
