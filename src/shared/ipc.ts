/**
 * IPC 通道定义。主进程与渲染进程之间的唯一通信契约。
 * 所有通道都在主进程统一注册，并通过 zod 校验输入。
 */
export const IPC = {
  // app
  AppInfo: 'app:info',
  WindowClose: 'app:window:close',
  WindowMinimize: 'app:window:minimize',

  // tasks
  TaskList: 'tasks:list',
  TaskCreate: 'tasks:create',
  TaskUpdate: 'tasks:update',
  TaskDelete: 'tasks:delete',
  TaskToggle: 'tasks:toggle',
  TaskReorder: 'tasks:reorder',

  // collections
  CollectionList: 'collections:list',
  CollectionCreate: 'collections:create',
  CollectionUpdate: 'collections:update',
  CollectionDelete: 'collections:delete',
  CollectionFetchMeta: 'collections:fetch-meta',
  CollectionCheckDuplicate: 'collections:check-duplicate',
  CollectionOpenExternal: 'collections:open-external',

  // vault
  VaultStatus: 'vault:status',
  VaultSetup: 'vault:setup',
  VaultUnlock: 'vault:unlock',
  VaultLock: 'vault:lock',
  VaultList: 'vault:list',
  VaultCreate: 'vault:create',
  VaultUpdate: 'vault:update',
  VaultDelete: 'vault:delete',
  VaultGetSecret: 'vault:get-secret',
  VaultChangePassword: 'vault:change-password',
  VaultCopySecret: 'vault:copy-secret',

  // file index
  FileList: 'files:list',
  FileCreate: 'files:create',
  FileUpdate: 'files:update',
  FileDelete: 'files:delete',
  FileCheck: 'files:check',
  FileStat: 'files:stat',
  FileOpen: 'files:open',
  FileOpenDir: 'files:open-dir',
  FileCopyPath: 'files:copy-path',
  FilePick: 'files:pick',

  // notes
  NoteList: 'notes:list',
  NoteGet: 'notes:get',
  NoteCreate: 'notes:create',
  NoteUpdate: 'notes:update',
  NoteDelete: 'notes:delete',
  NoteAddAttachment: 'notes:add-attachment',
  NoteRemoveAttachment: 'notes:remove-attachment',
  NoteListAttachments: 'notes:list-attachments',
  NoteReadAttachment: 'notes:read-attachment',
  NoteSaveAttachmentCopy: 'notes:save-attachment-copy',

  // timeline
  TimelineStats: 'timeline:stats',

  // 辅助查询（标签/分类/类型列表）
  CollectionsTags: 'collections:tags',
  NotesCategories: 'notes:categories',
  NotesTags: 'notes:tags',
  FilesTypes: 'files:types',
  NoteAttachmentSize: 'notes:attachment-size',

  // settings
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // dashboard
  DashboardStats: 'dashboard:stats',

  // search
  GlobalSearch: 'search:global',

  // backup / import / export
  BackupExport: 'backup:export',
  BackupImportPreview: 'backup:import-preview',
  BackupImport: 'backup:import',
  ExportData: 'export:data',

  // clipboard (generic)
  ClipboardWrite: 'clipboard:write',

  // dialog
  DialogOpenFile: 'dialog:open-file',
  DialogSaveFile: 'dialog:save-file',
  DialogPickDirectory: 'dialog:pick-directory',

  // notifications / toasts from main
  SystemNotify: 'system:notify'
} as const
