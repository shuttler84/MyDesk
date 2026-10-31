/**
 * IPC 注册中心。
 * 安全规则：
 * - 每个通道都必须声明 zod schema（无输入时为空对象 schema）。
 * - 任何解析/业务错误统一包装为 { ok:false, error }，不向渲染进程泄露堆栈。
 * - 保险箱相关通道全部经过 VaultManager（锁定状态下拒绝访问）。
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
import type { ServiceContext } from './services/context'
import type { VaultManager } from './vaultManager'
import { IPC } from '@shared/ipc'
import type { ExportFormat } from '@shared/types'
import { currentSchemaVersion } from '@database/migrator'
import * as v from '@shared/validation'
import * as taskService from './services/taskService'
import * as collectionService from './services/collectionService'
import * as fileIndexService from './services/fileIndexService'
import * as noteService from './services/noteService'
import * as settingsService from './services/settingsService'
import * as timelineService from './services/timelineService'
import * as dashboardService from './services/dashboardService'
import * as searchService from './services/searchService'
import * as backupService from './services/backupService'
import * as exportService from './services/exportService'
import { fetchUrlMeta } from './services/metaFetchService'
import { deleteManyCollections, setManyTags, getByIds } from './services/collectionService'
import { createManyFileIndex, getFileByIds } from './services/fileIndexService'
import { buildCollectionsCsvByIds, buildFilesCsvByIds } from './services/exportService'
import {
  listBackups,
  deleteBackup,
  runBackupNow,
  backupsDir
} from './services/backupService'
import { parseQuickAddInput } from '@shared/quickAdd'
import { localDateStr } from '@shared/datetime'
import type { NotificationCenter } from './notificationCenter'
import { logActivity } from './services/activityService'
import { statPath } from './services/fileIndexService'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { app } from 'electron'
import { join } from 'path'

type Handler = (input: unknown) => unknown | Promise<unknown>

function applyLaunchOnStartup(enabled: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch (err) {
    console.error('[MyDesk] setLoginItemSettings failed:', err)
  }
}

function register(channel: string, schema: z.ZodTypeAny, handler: Handler): void {
  ipcMain.handle(channel, async (_event, rawInput: unknown) => {
    try {
      const parsed = schema.safeParse(rawInput ?? {})
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw new Error(`Invalid input for ${channel}: ${issue?.path.join('.') || ''} ${issue?.message || ''}`)
      }
      const data = await handler(parsed.data)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

const empty = z.object({}).passthrough()

export interface IpcExtras {
  notifications: NotificationCenter
  hideQuickAdd: () => void
}

export function registerAllIpc(ctx: ServiceContext, vault: VaultManager, extras: IpcExtras): void {
  const { db, platform } = ctx

  // ---------- app ----------
  register(IPC.AppInfo, empty, () => ({
    version: ctx.appVersion,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    schemaVersion: currentSchemaVersion(db),
    dataDir: platform.dataDir(),
    dbPath: platform.dbPath(),
    platform: platform.name
  }))

  // ---------- tasks ----------
  register(IPC.TaskList, v.taskFilterSchema, (i) => taskService.listTasks(db, i as never))
  register(IPC.TaskCreate, v.taskCreateSchema, (i) => {
    const t = taskService.createTask(db, i as never)
    logActivity(db, 'task_created', t.id, t.title)
    return t
  })
  register(IPC.TaskUpdate, v.taskUpdateSchema, (i) => {
    const { id, ...patch } = i as { id: string } & Record<string, unknown>
    return taskService.updateTask(db, id, patch as never)
  })
  register(IPC.TaskDelete, z.object({ id: v.idSchema }), (i) => {
    taskService.deleteTask(db, (i as { id: string }).id)
    return true
  })
  register(IPC.TaskToggle, z.object({ id: v.idSchema }), (i) => {
    const t = taskService.toggleTask(db, (i as { id: string }).id)
    if (t.completed) logActivity(db, 'task_completed', t.id, t.title)
    return t
  })
  register(IPC.TaskReorder, v.taskReorderSchema, (i) => {
    taskService.reorderTasks(db, (i as { ids: string[] }).ids)
    return true
  })

  // ---------- collections ----------
  register(IPC.CollectionList, empty, (i) =>
    collectionService.listCollections(db, i as never)
  )
  register(IPC.CollectionCreate, v.collectionCreateSchema, (i) => {
    const c = collectionService.createCollection(db, i as never)
    logActivity(db, 'collection_created', c.id, c.name)
    return c
  })
  register(IPC.CollectionUpdate, v.collectionUpdateSchema, (i) => {
    const { id, ...patch } = i as { id: string } & Record<string, unknown>
    return collectionService.updateCollection(db, id, patch as never)
  })
  register(IPC.CollectionDelete, z.object({ id: v.idSchema }), (i) => {
    collectionService.deleteCollection(db, (i as { id: string }).id)
    return true
  })
  register(IPC.CollectionFetchMeta, z.object({ url: v.urlSchema }), async (i) =>
    fetchUrlMeta((i as { url: string }).url)
  )
  register(IPC.CollectionCheckDuplicate, z.object({ url: v.urlSchema }), (i) => {
    const existing = collectionService.findByUrl(db, (i as { url: string }).url)
    return existing ? { duplicate: true, collection: existing } : { duplicate: false }
  })
  register(IPC.CollectionOpenExternal, z.object({ url: v.urlSchema }), async (i) => {
    await platform.openExternal((i as { url: string }).url)
    return true
  })

  // ---------- vault ----------
  register(IPC.VaultStatus, empty, () => vault.status(db))
  register(IPC.VaultSetup, v.vaultSetupSchema, async (i) => vault.setup(db, (i as { masterPassword: string }).masterPassword))
  register(IPC.VaultUnlock, v.vaultUnlockSchema, async (i) => vault.unlock(db, (i as { masterPassword: string }).masterPassword))
  register(IPC.VaultLock, empty, () => {
    vault.lock()
    return true
  })
  register(IPC.VaultList, empty, () => {
    if (!vault.status(db).state.startsWith('unlocked')) throw new Error('Vault is locked')
    return vault.list(db)
  })
  register(IPC.VaultCreate, v.vaultCreateSchema, (i) => vault.create(db, i as never))
  register(IPC.VaultUpdate, v.vaultUpdateSchema, (i) => {
    const { id, ...patch } = i as { id: string } & Record<string, unknown>
    return vault.update(db, id, patch as never)
  })
  register(IPC.VaultDelete, z.object({ id: v.idSchema }), (i) => {
    vault.remove(db, (i as { id: string }).id)
    return true
  })
  register(IPC.VaultGetSecret, z.object({ id: v.idSchema }), (i) => ({
    secret: vault.revealSecret(db, (i as { id: string }).id)
  }))
  register(IPC.VaultCopySecret, z.object({ id: v.idSchema }), (i) =>
    vault.copySecret(db, platform, (i as { id: string }).id)
  )
  register(IPC.VaultChangePassword, v.vaultChangePasswordSchema, async (i) => {
    const p = i as { currentPassword: string; newPassword: string }
    return vault.changePassword(db, p.currentPassword, p.newPassword)
  })

  // ---------- file index ----------
  register(IPC.FileList, empty, (i) => fileIndexService.listFiles(db, i as never))
  register(IPC.FileCreate, v.fileCreateSchema, (i) => {
    const f = fileIndexService.createFileIndex(db, i as never)
    logActivity(db, 'file_created', f.id, f.name)
    return f
  })
  register(IPC.FileUpdate, v.fileUpdateSchema, (i) => {
    const { id, ...patch } = i as { id: string } & Record<string, unknown>
    return fileIndexService.updateFileIndex(db, id, patch as never)
  })
  register(IPC.FileDelete, z.object({ id: v.idSchema }), (i) => {
    fileIndexService.deleteFileIndex(db, (i as { id: string }).id)
    return true
  })
  register(IPC.FileCheck, z.object({ id: v.idSchema }), (i) =>
    fileIndexService.checkFile(db, (i as { id: string }).id)
  )
  register(IPC.FileStat, z.object({ path: z.string().min(1).max(1024) }), (i) =>
    statPath((i as { path: string }).path)
  )
  register(IPC.FileOpen, z.object({ id: v.idSchema }), async (i) => {
    const item = fileIndexService.getFileIndexItem(db, (i as { id: string }).id)
    if (!existsSync(item.path)) throw new Error('文件已不在记录的路径上')
    const ok = await platform.openPath(item.path)
    if (!ok) throw new Error('Windows 无法打开此文件')
    return true
  })
  register(IPC.FileOpenDir, z.object({ id: v.idSchema }), (i) => {
    const item = fileIndexService.getFileIndexItem(db, (i as { id: string }).id)
    platform.showItemInFolder(item.path)
    return true
  })
  register(IPC.FileCopyPath, z.object({ id: v.idSchema }), (i) => {
    const item = fileIndexService.getFileIndexItem(db, (i as { id: string }).id)
    platform.clipboardWriteText(item.path)
    return true
  })
  register(IPC.FilePick, empty, async () => platform.pickFile({ title: '选择要索引的文件' }))

  // ---------- notes ----------
  register(IPC.NoteList, empty, (i) => noteService.listNotes(db, i as never))
  register(IPC.NoteGet, z.object({ id: v.idSchema }), (i) =>
    noteService.getNote(db, (i as { id: string }).id)
  )
  register(IPC.NoteCreate, v.noteCreateSchema, (i) => {
    const n = noteService.createNote(db, i as never)
    logActivity(db, 'note_created', n.id, n.title || '(untitled)')
    return n
  })
  register(IPC.NoteUpdate, v.noteUpdateSchema, (i) => {
    const { id, ...patch } = i as { id: string } & Record<string, unknown>
    return noteService.updateNote(db, id, patch as never)
  })
  register(IPC.NoteDelete, z.object({ id: v.idSchema }), (i) => {
    noteService.deleteNote(ctx, (i as { id: string }).id)
    return true
  })
  register(IPC.NoteAddAttachment, z.object({ noteId: v.idSchema }), async (i) => {
    const picked = await platform.pickFile({ title: '添加附件' })
    if (!picked) return null
    return noteService.addAttachment(ctx, (i as { noteId: string }).noteId, picked)
  })
  register(IPC.NoteRemoveAttachment, z.object({ id: v.idSchema }), (i) => {
    noteService.removeAttachment(ctx, (i as { id: string }).id)
    return true
  })
  register(IPC.NoteListAttachments, z.object({ noteId: v.idSchema }), (i) =>
    noteService.listAttachments(db, (i as { noteId: string }).noteId)
  )
  register(IPC.NoteReadAttachment, z.object({ id: v.idSchema }), (i) => {
    const id = (i as { id: string }).id
    const row = db.prepare(`SELECT * FROM note_attachments WHERE id = ?`).get(id) as
      | { stored_name: string; mime: string }
      | undefined
    if (!row) throw new Error('附件不存在')
    const p = join(ctx.attachmentsDir, row.stored_name)
    // 防路径逃逸：存储名由系统生成，但仍校验
    if (!p.startsWith(ctx.attachmentsDir)) throw new Error('附件路径无效')
    if (!existsSync(p)) throw new Error('附件文件在磁盘上已丢失')
    const buf = readFileSync(p)
    if (buf.length > 20 * 1024 * 1024) throw new Error('附件过大，无法显示')
    return { mime: row.mime, base64: buf.toString('base64') }
  })
  register(IPC.NoteSaveAttachmentCopy, z.object({ id: v.idSchema }), async (i) => {
    const id = (i as { id: string }).id
    const row = db.prepare(`SELECT * FROM note_attachments WHERE id = ?`).get(id) as
      | { file_name: string; stored_name: string }
      | undefined
    if (!row) throw new Error('附件不存在')
    const p = join(ctx.attachmentsDir, row.stored_name)
    if (!existsSync(p)) throw new Error('附件文件在磁盘上已丢失')
    const target = await platform.pickSaveFile({ title: 'Save attachment as', defaultName: row.file_name })
    if (!target) return null
    copyFileSync(p, target)
    return { path: target }
  })

  // ---------- timeline / dashboard / search / settings ----------
  register(IPC.TimelineStats, empty, (i) =>
    timelineService.timelineStats(db, i as never)
  )
  register(IPC.DashboardStats, empty, () => dashboardService.dashboardStats(db))
  register(IPC.GlobalSearch, v.globalSearchSchema, (i) =>
    searchService.globalSearch(db, (i as { query: string }).query)
  )
  register(IPC.SettingsGet, empty, () => settingsService.getSettings(db))
  register(IPC.SettingsSet, v.settingsPatchSchema, (i) => {
    const next = settingsService.updateSettings(db, i as never)
    applyLaunchOnStartup(next.launchOnStartup)
    return next
  })

  // ---------- backup / export ----------
  register(IPC.BackupExport, v.backupExportSchema, (i) => {
    const p = (i as { filePath: string }).filePath
    const res = backupService.exportBackup(ctx, p)
    logActivity(db, 'backup_exported', null, p)
    return res
  })
  register(IPC.BackupImportPreview, v.backupImportSchema, (i) =>
    backupService.importPreview(ctx, (i as { filePath: string }).filePath)
  )
  register(IPC.BackupImport, v.backupImportSchema, (i) => {
    const p = (i as { filePath: string }).filePath
    const res = backupService.importBackup(ctx, p)
    logActivity(db, 'backup_imported', null, p)
    return res
  })
  register(IPC.ExportData, v.exportDataSchema, (i) => {
    const p = i as { filePath: string; format: ExportFormat }
    return exportService.exportData(db, p.format, p.filePath, ctx.appVersion)
  })

  // ---------- clipboard / dialog ----------
  register(IPC.ClipboardWrite, z.object({ text: z.string().max(1_000_000) }), (i) => {
    platform.clipboardWriteText((i as { text: string }).text)
    return true
  })
  register(IPC.DialogOpenFile, empty, async () => platform.pickFile({}))
  register(IPC.DialogSaveFile, empty, async (i) => {
    const input = i as { defaultName?: string; filters?: { name: string; extensions: string[] }[] }
    return platform.pickSaveFile({
      defaultName: input.defaultName,
      filters: input.filters
    })
  })
  register(IPC.DialogPickDirectory, empty, async () => platform.pickDirectory({}))
  register(IPC.DialogPickFiles, empty, async () => platform.pickFiles({ title: '选择文件（可多选）' }))

  // ---------- 阶段二：全局快速添加 ----------
  register(IPC.QuickAddSave, v.quickAddSaveSchema, async (i) => {
    const input = i as { kind: 'task' | 'note' | 'url' | 'github' | 'file'; text: string; extra?: string }
    const { kind, text, extra } = input
    if (kind === 'task') {
      const t = taskService.createTask(db, { title: text, notes: extra ?? '', dueDate: localDateStr() })
      logActivity(db, 'task_created', t.id, t.title)
      return { kind, item: t }
    }
    if (kind === 'note') {
      const title = text.split('\n')[0].slice(0, 60) || '快速笔记'
      const n = noteService.createNote(db, { title, content: [text, extra].filter(Boolean).join('\n\n') })
      logActivity(db, 'note_created', n.id, n.title)
      return { kind, item: n }
    }
    if (kind === 'file') {
      const f = fileIndexService.createFileIndex(db, { path: text })
      logActivity(db, 'file_created', f.id, f.name)
      return { kind, item: f }
    }
    // url / github：先保存，后台补充元数据（不阻塞快速添加）
    let host = text
    try {
      host = new URL(text).hostname
    } catch {
      /* ignore */
    }
    const gh = text.match(new RegExp('^https?://(www\.)?github\.com/([A-Za-z0-9-_.]+)/([A-Za-z0-9-_.]+)', 'i'))
    const c = collectionService.createCollection(db, {
      name: gh ? `${gh[2]}/${gh[3].replace(/.git$/, '')}` : host,
      url: text,
      type: kind === 'github' ? 'github' : 'website'
    })
    logActivity(db, 'collection_created', c.id, c.name)
    void fetchUrlMeta(text)
      .then((meta) => {
        if (meta.title || meta.description || meta.favicon) {
          collectionService.updateCollection(db, c.id, {
            name: meta.title ?? c.name,
            description: meta.description ?? '',
            favicon: meta.favicon ?? undefined,
            previewImage: meta.previewImage ?? undefined
          })
        }
      })
      .catch(() => undefined)
    return { kind, item: c }
  })

  // ---------- 阶段二：批量操作 ----------
  register(IPC.CollectionsBatchDelete, v.idsSchema, (i) => {
    return { deleted: deleteManyCollections(db, (i as { ids: string[] }).ids) }
  })
  register(IPC.CollectionsBatchTags, v.batchTagsSchema, (i) => {
    const p2 = i as { ids: string[]; mode: 'replace' | 'add'; tags: string[] }
    return { updated: setManyTags(db, p2.ids, p2.mode, p2.tags) }
  })
  register(IPC.CollectionsExportSelected, v.exportSelectedSchema, (i) => {
    const p3 = i as { filePath: string; ids: string[] }
    const target = p3.filePath.endsWith('.csv') ? p3.filePath : p3.filePath + '.csv'
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, buildCollectionsCsvByIds(db, p3.ids), 'utf8')
    return { path: target, count: p3.ids.length }
  })
  register(IPC.FilesBatchAdd, v.batchAddFilesSchema, (i) => {
    return createManyFileIndex(db, (i as { paths: string[] }).paths)
  })
  register(IPC.FilesBatchCheck, v.idsSchema, (i) => {
    const ids = (i as { ids: string[] }).ids
    const results = ids.map((id) => {
      try {
        return { id, ...(fileIndexService.checkFile(db, id)) }
      } catch (err) {
        return { id, error: err instanceof Error ? err.message : String(err) }
      }
    })
    return { results }
  })
  register(IPC.FilesExportSelected, v.exportSelectedSchema, (i) => {
    const p4 = i as { filePath: string; ids: string[] }
    const target = p4.filePath.endsWith('.csv') ? p4.filePath : p4.filePath + '.csv'
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, buildFilesCsvByIds(db, p4.ids), 'utf8')
    return { path: target, count: p4.ids.length }
  })

  // ---------- 阶段二：备份中心 ----------
  register(IPC.BackupList, empty, () => listBackups(ctx))
  register(IPC.BackupDelete, v.backupFileNameSchema, (i) => {
    deleteBackup(ctx, (i as { fileName: string }).fileName)
    return true
  })
  register(IPC.BackupRunNow, empty, () => {
    const fileName = runBackupNow(ctx)
    logActivity(db, 'backup_exported', null, fileName)
    return { fileName }
  })
  register(IPC.BackupOpenFolder, empty, async () => {
    const { shell } = await import('electron')
    await shell.openPath(backupsDir(ctx))
    return true
  })

  // ---------- 阶段二：通知中心 ----------
  register(IPC.NotificationList, empty, () => extras.notifications.list())

  // ---------- misc reads used by UI ----------
  register('collections:tags', empty, () => collectionService.allTags(db))
  register('notes:categories', empty, () => noteService.noteCategories(db))
  register('notes:tags', empty, () => noteService.allNoteTags(db))
  register('files:types', empty, () => fileIndexService.allFileTypes(db))
  // 附件是否存在（用于笔记图片预览的 data URL 加载）
  register('notes:attachment-size', z.object({ id: v.idSchema }), (i) => {
    const row = db.prepare(`SELECT stored_name FROM note_attachments WHERE id = ?`).get(
      (i as { id: string }).id
    ) as { stored_name: string } | undefined
    if (!row) return { size: null }
    const p = join(ctx.attachmentsDir, row.stored_name)
    try {
      return { size: statSync(p).size }
    } catch {
      return { size: null }
    }
  })
}
