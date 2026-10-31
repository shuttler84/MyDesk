/**
 * 提醒调度器（主进程）。
 * 每 20 秒扫描一次任务表，找出"现在应当提醒"的任务，用 reminder_log 去重后通知。
 * 勿扰时段内只进入通知中心，不发系统通知。
 * 软件完全退出后调度自然停止（如实边界：退出后无后台提醒）。
 */
import { randomUUID } from 'crypto'
import type { ServiceContext } from './services/context'
import { getSettings } from './services/settingsService'
import { findDueCandidates, isInQuietHours } from '@shared/reminder'
import { rowToTask, type TaskRow } from './services/taskService'

export interface ReminderNotifier {
  (item: { kind: 'reminder'; title: string; body: string; systemWhenHidden?: boolean }): void
}

export function startReminderScheduler(
  ctx: ServiceContext,
  notify: ReminderNotifier,
  intervalMs = 20_000
): NodeJS.Timeout {
  const tick = () => {
    try {
      const settings = getSettings(ctx.db)
      const now = new Date()
      // 候选：未完成且有截止日期的任务（提前 1 天范围，够查提前 1440 分钟的提醒）
      const rows = ctx.db
        .prepare(
          `SELECT * FROM tasks WHERE completed = 0 AND due_date IS NOT NULL
           AND due_date <= date(?, '+1 day')`
        )
        .all(todayLocal(now))
        .map((r) => rowToTask(r as TaskRow))
      const candidates = findDueCandidates(rows, now, settings.defaultReminderMinutes)

      if (candidates.length > 0) {
      }
      for (const { task } of candidates) {
        // 去重：同一任务只提醒一次
        const logged = ctx.db
          .prepare(`SELECT 1 FROM reminder_log WHERE task_id = ? AND kind = 'due' LIMIT 1`)
          .get(task.id)
        if (logged) continue
        ctx.db
          .prepare(`INSERT INTO reminder_log (id, task_id, kind, reminded_at) VALUES (?, ?, 'due', ?)`)
          .run(randomUUID(), task.id, now.toISOString())

        notify({
          kind: 'reminder',
          title: task.isImportant ? `⭐ 任务即将到期：${task.title}` : `任务即将到期：${task.title}`,
          body: `截止时间 ${task.dueDate}${task.dueTime ? ' ' + task.dueTime : ''}`,
          systemWhenHidden: true
        })
      }
      void isInQuietHours // 勿扰判断由 NotificationCenter 内部使用
    } catch (err) {
      console.error('[MyDesk] reminder tick failed:', err instanceof Error ? err.message : err)
    }
  }
  console.log('[MyDesk] reminder scheduler started')
  const timer = setInterval(tick, intervalMs)
  if (timer.unref) timer.unref()
  // 启动后先跑一次
  setTimeout(tick, 3_000).unref?.()
  return timer
}

function todayLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export { isInQuietHours }
