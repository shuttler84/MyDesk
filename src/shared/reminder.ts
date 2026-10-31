/**
 * 任务提醒核心逻辑（平台无关，可测试）。
 * 主进程定时调用 computeDueReminders 与任务表 + reminder_log 比对。
 */
import type { Task } from './types'
import { localDateStr } from './datetime'

/**
 * 计算任务的截止时刻（本地时区 Date）。
 * 只有 dueDate 存在的任务才有明确截止时间；dueTime 缺省视为当天 23:59。
 */
export function taskDueDate(task: Pick<Task, 'dueDate' | 'dueTime'>): Date | null {
  if (!task.dueDate) return null
  const [y, m, d] = task.dueDate.split('-').map(Number)
  let hh = 23
  let mm = 59
  if (task.dueTime) {
    const parts = task.dueTime.split(':').map(Number)
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      hh = parts[0]
      mm = parts[1]
    }
  }
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

/** 单位：分钟。reminderMinutes：null=默认（提前 10 分钟）；0=到期时；N=提前 N 分钟 */
export const DEFAULT_REMINDER_LEAD_MINUTES = 10

export function effectiveLeadMinutes(taskReminder: number | null, defaultReminder: number | null): number | null {
  if (taskReminder !== null && taskReminder !== undefined) return taskReminder
  return defaultReminder
}

export interface DueCandidate {
  task: Task
  /** 应当触发提醒的时刻 */
  remindAt: Date
}

/**
 * 找出"现在应当提醒"的任务：
 * - 未完成、有截止时间
 * - remindAt <= now 且尚未过期超过 60 分钟（避免补发陈旧提醒的轰炸）
 * - 由调用方用 reminder_log 去重
 */
export function findDueCandidates(
  tasks: Task[],
  now: Date,
  defaultReminderMinutes: number | null
): DueCandidate[] {
  const result: DueCandidate[] = []
  for (const task of tasks) {
    if (task.completed) continue
    const lead = effectiveLeadMinutes(task.reminderMinutes, defaultReminderMinutes)
    if (lead === null) continue // 该任务不提醒
    const due = taskDueDate(task)
    if (!due) continue
    const remindAt = new Date(due.getTime() - lead * 60_000)
    const staleLimit = due.getTime() + 60 * 60_000
    if (remindAt.getTime() <= now.getTime() && now.getTime() <= staleLimit) {
      result.push({ task, remindAt })
    }
  }
  return result
}

/** 是否处于勿扰时间段（支持跨午夜，如 22:00–08:00） */
export function isInQuietHours(now: Date, quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false
  const parse = (s: string): number => {
    const [h, m] = s.split(':').map(Number)
    return h * 60 + (m || 0)
  }
  const cur = now.getHours() * 60 + now.getMinutes()
  const start = parse(quietStart)
  const end = parse(quietEnd)
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  if (start === end) return false
  if (start < end) return cur >= start && cur < end
  return cur >= start || cur < end // 跨午夜
}

/** 今天的本地日期（便捷导出，便于提醒服务使用） */
export function todayStr(): string {
  return localDateStr()
}
