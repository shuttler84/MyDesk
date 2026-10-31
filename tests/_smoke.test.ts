import { describe, it, expect } from 'vitest'
import { openDatabase } from '@database/connection'
import { migrate, currentSchemaVersion } from '@database/migrator'
import * as tasks from '@main/services/taskService'
import { fetchUrlMeta } from '@main/services/metaFetchService'

describe('smoke', () => {
  it('migrates fresh db to v1 and CRUD tasks', () => {
    const db = openDatabase(':memory:')
    const res = migrate(db)
    expect(res.toVersion).toBe(1)
    expect(currentSchemaVersion(db)).toBe(1)
    const t = tasks.createTask(db, { title: 'hello', priority: 'high' })
    expect(t.id).toBeTruthy()
    const list = tasks.listTasks(db, { view: 'today' })
    expect(list).toHaveLength(1)
    tasks.reorderTasks(db, [t.id])
    const done = tasks.toggleTask(db, t.id)
    expect(done.completed).toBe(true)
  })

  it('rejects non-http url in meta fetch', async () => {
    const meta = await fetchUrlMeta('ftp://bad')
    expect(meta.error).toBeTruthy()
  })
})
