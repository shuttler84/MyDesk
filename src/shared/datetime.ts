/**
 * 时间工具。业务数据一律存 UTC ISO 字符串；"本地日期"（YYYY-MM-DD）仅用于
 * 任务截止日期等用户视角字段。
 */

export function nowIso(): string {
  return new Date().toISOString()
}

/** 本地日期 YYYY-MM-DD */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 将 UTC ISO 时间转换为本地 YYYY-MM-DD（用于按日统计） */
export function isoToLocalDate(iso: string): string {
  return localDateStr(new Date(iso))
}

export function weekdayName(d: Date = new Date()): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
}

/**
 * 任务跨日规则（任务书要求明确规则，避免重复生成或丢失）：
 * 未完成任务不移动、不复制数据。"今日"视图 = due_date <= 今天 的未完成任务（含逾期），
 * 因此昨天的未完成任务自然"延续"到今天且不产生重复记录；"未来计划" = due_date > 今天。
 */
export function isOverdue(dueDate: string | null, today = localDateStr()): boolean {
  return dueDate !== null && dueDate < today
}
