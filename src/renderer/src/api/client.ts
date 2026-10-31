/**
 * 渲染进程 API 客户端：window.mydesk.invoke 的类型化封装。
 * 所有方法返回解包后的数据，失败时抛出主进程给出的错误信息。
 */
import { IPC } from '@shared/ipc'
import type * as T from '@shared/types'

export async function call<T>(channel: string, payload?: unknown): Promise<T> {
  const res = await window.mydesk.invoke(channel, payload)
  if (!res.ok) throw new Error(res.error ?? 'Unknown error')
  return res.data as T
}

export const api = {
  app: {
    info: () => call<T.AppInfo>(IPC.AppInfo)
  },
  tasks: {
    list: (filter: T.TaskFilter) => call<T.Task[]>(IPC.TaskList, filter),
    create: (input: T.TaskInput) => call<T.Task>(IPC.TaskCreate, input),
    update: (id: string, patch: Partial<T.TaskInput> & { completed?: boolean }) =>
      call<T.Task>(IPC.TaskUpdate, { id, ...patch }),
    remove: (id: string) => call<boolean>(IPC.TaskDelete, { id }),
    toggle: (id: string) => call<T.Task>(IPC.TaskToggle, { id }),
    reorder: (ids: string[]) => call<boolean>(IPC.TaskReorder, { ids })
  },
  collections: {
    list: (filter: CollectionFilterLike) => call<T.Collection[]>(IPC.CollectionList, filter),
    create: (input: T.CollectionInput) => call<T.Collection>(IPC.CollectionCreate, input),
    update: (id: string, patch: Record<string, unknown>) =>
      call<T.Collection>(IPC.CollectionUpdate, { id, ...patch }),
    remove: (id: string) => call<boolean>(IPC.CollectionDelete, { id }),
    fetchMeta: (url: string) => call<T.UrlMeta>(IPC.CollectionFetchMeta, { url }),
    checkDuplicate: (url: string) =>
      call<{ duplicate: boolean; collection?: T.Collection }>(IPC.CollectionCheckDuplicate, { url }),
    openExternal: (url: string) => call<boolean>(IPC.CollectionOpenExternal, { url }),
    tags: () => call<string[]>(IPC.CollectionsTags)
  },
  vault: {
    status: () => call<T.VaultStatus>(IPC.VaultStatus),
    setup: (masterPassword: string) => call<T.VaultStatus>(IPC.VaultSetup, { masterPassword }),
    unlock: (masterPassword: string) => call<T.VaultStatus>(IPC.VaultUnlock, { masterPassword }),
    lock: () => call<boolean>(IPC.VaultLock),
    list: () => call<T.VaultItem[]>(IPC.VaultList),
    create: (input: T.VaultItemInput) => call<T.VaultItem>(IPC.VaultCreate, input),
    update: (id: string, patch: Partial<T.VaultItemInput>) =>
      call<T.VaultItem>(IPC.VaultUpdate, { id, ...patch }),
    remove: (id: string) => call<boolean>(IPC.VaultDelete, { id }),
    revealSecret: (id: string) => call<{ secret: string }>(IPC.VaultGetSecret, { id }),
    copySecret: (id: string) => call<{ clearedAfterSeconds: number }>(IPC.VaultCopySecret, { id }),
    changePassword: (currentPassword: string, newPassword: string) =>
      call<T.VaultStatus>(IPC.VaultChangePassword, { currentPassword, newPassword })
  },
  files: {
    list: (filter?: FileFilterLike) => call<T.FileIndexItem[]>(IPC.FileList, filter ?? {}),
    create: (input: { path: string; name?: string; version?: string; notes?: string; tags?: string[] }) =>
      call<T.FileIndexItem>(IPC.FileCreate, input),
    update: (id: string, patch: Record<string, unknown>) =>
      call<T.FileIndexItem>(IPC.FileUpdate, { id, ...patch }),
    remove: (id: string) => call<boolean>(IPC.FileDelete, { id }),
    check: (id: string) =>
      call<{ item: T.FileIndexItem; result: T.FileCheckResult }>(IPC.FileCheck, { id }),
    stat: (path: string) => call<StatInfoLike>(IPC.FileStat, { path }),
    open: (id: string) => call<boolean>(IPC.FileOpen, { id }),
    openDir: (id: string) => call<boolean>(IPC.FileOpenDir, { id }),
    copyPath: (id: string) => call<boolean>(IPC.FileCopyPath, { id }),
    pick: () => call<string | null>(IPC.FilePick),
    types: () => call<string[]>(IPC.FilesTypes)
  },
  notes: {
    list: (filter?: { search?: string; category?: string; tag?: string }) =>
      call<T.Note[]>(IPC.NoteList, filter ?? {}),
    get: (id: string) => call<T.Note>(IPC.NoteGet, { id }),
    create: (input: T.NoteInput) => call<T.Note>(IPC.NoteCreate, input),
    update: (id: string, patch: Partial<T.NoteInput>) => call<T.Note>(IPC.NoteUpdate, { id, ...patch }),
    remove: (id: string) => call<boolean>(IPC.NoteDelete, { id }),
    attachments: (noteId: string) => call<T.NoteAttachment[]>(IPC.NoteListAttachments, { noteId }),
    addAttachment: (noteId: string) => call<T.NoteAttachment | null>(IPC.NoteAddAttachment, { noteId }),
    removeAttachment: (id: string) => call<boolean>(IPC.NoteRemoveAttachment, { id }),
    readAttachment: (id: string) => call<{ mime: string; base64: string }>(IPC.NoteReadAttachment, { id }),
    saveAttachmentCopy: (id: string) => call<{ path: string } | null>(IPC.NoteSaveAttachmentCopy, { id }),
    categories: () => call<string[]>(IPC.NotesCategories),
    tags: () => call<string[]>(IPC.NotesTags)
  },
  timeline: {
    stats: (range?: { from?: string | null; to?: string | null }) =>
      call<T.TimelineStats>(IPC.TimelineStats, range ?? {})
  },
  settings: {
    get: () => call<T.AppSettings>(IPC.SettingsGet),
    set: (patch: Partial<T.AppSettings>) => call<T.AppSettings>(IPC.SettingsSet, patch)
  },
  dashboard: {
    stats: () => call<T.DashboardStats>(IPC.DashboardStats)
  },
  search: {
    global: (query: string) => call<T.GlobalSearchResult[]>(IPC.GlobalSearch, { query })
  },
  backup: {
    export: (filePath: string) => call<{ fileCount: number }>(IPC.BackupExport, { filePath }),
    importPreview: (filePath: string) => call<T.ImportPreview>(IPC.BackupImportPreview, { filePath }),
    import: (filePath: string) => call<ImportResultLike>(IPC.BackupImport, { filePath })
  },
  exportData: {
    run: (filePath: string, format: T.ExportFormat) =>
      call<{ path: string; count: number }>(IPC.ExportData, { filePath, format })
  },
  dialog: {
    saveFile: (opts: { defaultName?: string; filters?: { name: string; extensions: string[] }[] }) =>
      call<string | null>(IPC.DialogSaveFile, opts),
    openFile: () => call<string | null>(IPC.DialogOpenFile),
    pickDirectory: () => call<string | null>(IPC.DialogPickDirectory)
  }
}

export type CollectionFilterLike = {
  type?: T.CollectionType | 'all'
  tags?: string[]
  status?: T.ResearchStatus | 'all'
  search?: string
}
export type FileFilterLike = { search?: string; fileType?: string | 'all'; tag?: string }
export type StatInfoLike = {
  exists: boolean
  name: string | null
  fileType: string | null
  size: number | null
  isDirectory: boolean
}
export type ImportResultLike = { restored: Record<string, number> }
