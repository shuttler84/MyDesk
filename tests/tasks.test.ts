/**
 * 任务模块业务规则测试：视图划分 / 跨日延续 / 排序持久化 / 完成 / 筛选。
 */
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDatabase } from '@database/connection'
import { migrate } from '@database/migrator'
import * as tasks from '@main/services/taskService'
import { localDateStr } from '@shared/datetime'

function tempDb() {
  const d = mkdtempSync(join(tmpdir(), 'mydesk-task-'))
  const db = openDatabase(join(d, 't.db'))
  migrate(db)
  return db
}

describe('tasks', () => {
  it('today view includes overdue and undated tasks; upcoming excludes them', () => {
    const db = tempDb()
    const today = localDateStr()
    const yesterday = localDateStr(new Date(Date.now() - 86400000))
    const tomorrow = localDateStr(new Date(Date.now() + 86400000))

    tasks.createTask(db, { title: 'undated' })
    tasks.createTask(db, { title: 'overdue', dueDate: yesterday })
    tasks.createTask(db, { title: 'today-ok', dueDate: today })
    tasks.createTask(db, { title: 'future', dueDate: tomorrow })

    const todayView = tasks.listTasks(db, { view: 'today' }).map((t) => t.title)
    expect(todayView).toContain('undated')
    expect(todayView).toContain('overdue') // 未完成任务跨日延续：不复制、不丢失
    expect(todayView).toContain('today-ok')
    expect(todayView).not.toContain('future')

    const upcoming = tasks.listTasks(db, { view: 'upcoming' }).map((t) => t.title)
    expect(upcoming).toEqual(['future'])
    db.close()
  })

  it('important tasks pin to top regardless of sort order', () => {
    const db = tempDb()
    tasks.createTask(db, { title: 'normal 1' })
    tasks.createTask(db, { title: 'pinned', isImportant: true })
    tasks.createTask(db, { title: 'normal 2' })
    const list = tasks.listTasks(db, { view: 'today' })
    expect(list[0].title).toBe('pinned')
    db.close()
  })

  it('drag reorder persists and completes with timestamps', () => {
    const db = tempDb()
    const a = tasks.createTask(db, { title: 'a' })
    const b = tasks.createTask(db, { title: 'b' })
    const c = tasks.createTask(db, { title: 'c' })
    tasks.reorderTasks(db, [c.id, a.id, b.id])
    const list = tasks.listTasks(db, { view: 'today' })
    expect(list.map((t) => t.title)).toEqual(['c', 'a', 'b'])

    const done = tasks.toggleTask(db, a.id)
    expect(done.completed).toBe(true)
    expect(done.completedAt).toBeTruthy()
    const completed = tasks.listTasks(db, { view: 'completed' })
    expect(completed).toHaveLength(1)
    expect(completed[0].id).toBe(a.id)
    db.close()
  })

  it('priority & search filters work', () => {
    const db = tempDb()
    tasks.createTask(db, { title: 'high task', priority: 'high' })
    tasks.createTask(db, { title: 'low task', priority: 'low' })
    tasks.createTask(db, { title: 'buy milk' })
    expect(tasks.listTasks(db, { view: 'all', priority: 'high' })).toHaveLength(1)
    expect(tasks.listTasks(db, { view: 'all', search: 'milk' })).toHaveLength(1)
    expect(tasks.listTasks(db, { view: 'all', search: '%' })).toHaveLength(0) // LIKE 注入安全
    db.close()
  })
})
