/**
 * 阶段二核心逻辑测试：快速添加识别器、提醒调度逻辑、勿扰时段。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseQuickAddInput } from '@shared/quickAdd'
import {
  findDueCandidates,
  isInQuietHours,
  taskDueDate,
  effectiveLeadMinutes,
  DEFAULT_REMINDER_LEAD_MINUTES
} from '@shared/reminder'
import type { Task } from '@shared/types'
import * as backupSvc from '@main/services/backupService'
import * as settingsSvc from '@main/services/settingsService'
import { makeContext } from './helpers'

function await0() { return backupSvc }
function await1() { return settingsSvc }

function makeTask(partial: Partial<Task>): Task {
  return {
    id: 't1',
    title: '测试任务',
    notes: '',
    priority: 'medium',
    dueDate: null,
    dueTime: null,
    completed: false,
    completedAt: null,
    isImportant: false,
    sortOrder: 0,
    reminderMinutes: null,
    createdAt: '2026-10-31T00:00:00Z',
    updatedAt: '2026-10-31T00:00:00Z',
    ...partial
  }
}

describe('quick add parser', () => {
  it('recognizes website URLs', () => {
    const r = parseQuickAddInput('https://developer.mozilla.org/zh-CN/')
    expect(r.kind).toBe('url')
  })

  it('recognizes GitHub repo links', () => {
    const r = parseQuickAddInput('https://github.com/microsoft/vscode')
    expect(r.kind).toBe('github')
    expect(r.hint).toContain('microsoft/vscode')
  })

  it('recognizes Windows file paths', () => {
    const r = parseQuickAddInput('C:\\Users\\test\\report.pdf')
    expect(r.kind).toBe('file')
    const r2 = parseQuickAddInput('\\\\NAS\\share\\doc.docx')
    expect(r2.kind).toBe('file')
  })

  it('falls back to task for plain text', () => {
    const r = parseQuickAddInput('明天上午写周报')
    expect(r.kind).toBe('task')
  })

  it('does not treat random text with slashes as file', () => {
    const r = parseQuickAddInput('这是一个普通句子')
    expect(r.kind).toBe('task')
  })

  it('rejects non-http protocols as url', () => {
    const r = parseQuickAddInput('file://C:/evil/payload')
    expect(r.kind).not.toBe('url')
  })
})

describe('reminder logic', () => {
  const now = new Date(2026, 9, 31, 12, 0, 0) // 2026-10-31 12:00 本地

  it('computes due date with default 23:59 when no time', () => {
    const d = taskDueDate({ dueDate: '2026-10-31', dueTime: null })
    expect(d).not.toBeNull()
    expect(d!.getHours()).toBe(23)
    expect(d!.getMinutes()).toBe(59)
  })

  it('respects explicit due time', () => {
    const d = taskDueDate({ dueDate: '2026-10-31', dueTime: '14:30' })
    expect(d!.getHours()).toBe(14)
    expect(d!.getMinutes()).toBe(30)
  })

  it('effective lead: task override wins, then default, null = off', () => {
    expect(effectiveLeadMinutes(5, 10)).toBe(5)
    expect(effectiveLeadMinutes(null, 10)).toBe(10)
    expect(effectiveLeadMinutes(null, null)).toBeNull()
    expect(effectiveLeadMinutes(0, 10)).toBe(0)
  })

  it('finds candidates inside reminder window', () => {
    // 截止 12:10，默认提前 10 分钟 → 提醒时刻 12:00 = now
    const task = makeTask({ dueDate: '2026-10-31', dueTime: '12:10' })
    const candidates = findDueCandidates([task], now, DEFAULT_REMINDER_LEAD_MINUTES)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].task.id).toBe('t1')
  })

  it('null follows the global default; completed tasks are always skipped', () => {
    const done = makeTask({ completed: true, dueDate: '2026-10-31', dueTime: '12:10' })
    const followDefault = makeTask({ dueDate: '2026-10-31', dueTime: '12:10', reminderMinutes: null })
    expect(findDueCandidates([done], now, 10)).toHaveLength(0)
    // null = 跟随全局默认：默认开启时提醒，默认关闭时不提醒
    expect(findDueCandidates([followDefault], now, 10)).toHaveLength(1)
    expect(findDueCandidates([followDefault], now, null)).toHaveLength(0)
  })

  it('does not re-remind long-expired tasks (stale limit 1h)', () => {
    const task = makeTask({ dueDate: '2026-10-31', dueTime: '09:00' })
    expect(findDueCandidates([task], now, 10)).toHaveLength(0)
  })

  it('per-task reminderMinutes=0 reminds exactly at due time', () => {
    const task = makeTask({ dueDate: '2026-10-31', dueTime: '12:00', reminderMinutes: 0 })
    expect(findDueCandidates([task], now, null)).toHaveLength(1)
  })
})

describe('quiet hours', () => {
  it('handles normal range', () => {
    expect(isInQuietHours(new Date(2026, 9, 31, 23, 0), '22:00', '08:00')).toBe(true)
    expect(isInQuietHours(new Date(2026, 9, 31, 12, 0), '22:00', '08:00')).toBe(false)
  })

  it('handles cross-midnight range', () => {
    expect(isInQuietHours(new Date(2026, 9, 31, 1, 0), '22:00', '08:00')).toBe(true)
    expect(isInQuietHours(new Date(2026, 9, 31, 21, 59), '22:00', '08:00')).toBe(false)
  })

  it('is off when unset or equal', () => {
    expect(isInQuietHours(new Date(2026, 9, 31, 23, 0), null, null)).toBe(false)
    expect(isInQuietHours(new Date(2026, 9, 31, 23, 0), '22:00', '22:00')).toBe(false)
  })
})

describe('auto backup', () => {
  it('runs only when enabled and after the interval elapses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mydesk-autobackup-'))
    const { ctx, db } = makeContext(dir)
    const { autoBackupIfDue } = await0()
    const { updateSettings } = await1()
    const now = new Date()

    // 未启用 → null
    expect(autoBackupIfDue(ctx, now)).toBeNull()

    // 启用 → 第一次触发
    updateSettings(db, { autoBackupEnabled: true, autoBackupFrequency: 'daily' })
    const r1 = autoBackupIfDue(ctx, now)
    expect(r1).not.toBeNull()
    expect(r1!.triggered).toBe('daily')

    // 刚备份过 → 不重复
    expect(autoBackupIfDue(ctx, new Date(now.getTime() + 3600_000))).toBeNull()

    // 超过一天 → 再次触发
    const r2 = autoBackupIfDue(ctx, new Date(now.getTime() + 25 * 3600_000))
    expect(r2).not.toBeNull()
    db.close()
  })
})
