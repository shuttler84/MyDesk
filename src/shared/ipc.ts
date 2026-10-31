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
  DialogPickFiles: 'dialog:pick-files',

  // notifications / toasts from main
  SystemNotify: 'system:notify',

  // ===== 阶段二新增 =====
  // 全局快速添加（保存）
  QuickAddSave: 'quickadd:save',
  // 批量操作
  CollectionsBatchDelete: 'collections:batch-delete',
  CollectionsBatchTags: 'collections:batch-tags',
  CollectionsExportSelected: 'collections:export-selected',
  FilesBatchAdd: 'files:batch-add',
  FilesBatchCheck: 'files:batch-check',
  FilesExportSelected: 'files:export-selected',
  // 备份中心
  BackupList: 'backup:list',
  BackupDelete: 'backup:delete',
  BackupRunNow: 'backup:run-now',
  BackupOpenFolder: 'backup:open-folder',
  BackupVerify: 'backup:verify',
  // 主进程推送（webContents.send；渲染层经 preload onPush 监听）
  PushNotification: 'push:notification',
  // 通知中心
  NotificationList: 'notification:list',

  // ===== 阶段三新增 =====
  // 收藏分组
  GroupList: 'groups:list',
  GroupCreate: 'groups:create',
  GroupUpdate: 'groups:update',
  GroupDelete: 'groups:delete',
  // 收藏增强
  CollectionSetGroup: 'collections:set-group',
  CollectionHistory: 'collections:history',
  CollectionStats: 'collections:stats',
  CollectionDuplicates: 'collections:duplicates',
  // 文件索引增强
  FileStats: 'files:stats',
  FileScanStart: 'files:scan-start',
  FileScanCancel: 'files:scan-cancel',
  FileScanCommit: 'files:scan-commit',
  FileImportCsv: 'files:import-csv',
  FileCleanupInvalid: 'files:cleanup-invalid',
  // 数据管理中心
  DataIntegrity: 'data:integrity',
  // 浏览器扩展
  ExtensionStatus: 'extension:status',
  ExtensionResetToken: 'extension:reset-token',
  ExtensionSetEnabled: 'extension:set-enabled'
} as const
