/**
 * MyDesk — 跨平台共享数据模型。
 * 这些类型是"平台无关"的：主进程、渲染进程以及未来 Android 端都应以此为准。
 * 时间一律使用 ISO 8601 UTC 字符串（以 "Z" 结尾）。
 */

// ---------- 通用 ----------

export type ID = string

/** 低 / 中 / 高 */
export type Priority = 'low' | 'medium' | 'high'

export const PRIORITIES: Priority[] = ['low', 'medium', 'high']

// ---------- Settings ----------

export type ThemeName = 'mint' | 'lavender' | 'cream' | 'midnight' | 'glass'

export const THEMES: ThemeName[] = ['mint', 'lavender', 'cream', 'midnight', 'glass']

/** 动画偏好：full 全部动画 / reduced 减少动画 / off 关闭动画 */
export type AnimationPref = 'full' | 'reduced' | 'off'

/** 关闭窗口行为：ask 每次询问 / tray 隐藏到托盘 / exit 直接退出 */
export type TrayCloseBehavior = 'ask' | 'tray' | 'exit'

/** 自动备份频率 */
export type AutoBackupFrequency = 'daily' | 'weekly'

export interface AppSettings {
  theme: ThemeName
  animation: AnimationPref
  startPage: PageId
  vaultAutoLockMinutes: number
  clipboardClearSeconds: number
  /** 关闭主窗口时的行为 */
  trayCloseBehavior: TrayCloseBehavior
  /** 开机自动启动 */
  launchOnStartup: boolean
  /** 自动备份 */
  autoBackupEnabled: boolean
  autoBackupFrequency: AutoBackupFrequency
  /** 自动备份保留份数 */
  autoBackupKeepCount: number
  /** 勿扰时间段（HH:mm），null 表示不启用 */
  quietStart: string | null
  quietEnd: string | null
  /** 默认提醒策略：null=不提醒；0=到期时；N=提前 N 分钟 */
  defaultReminderMinutes: number | null
  /** 浏览器扩展本地服务（V3） */
  extensionEnabled: boolean
}

export type PageId =
  | 'dashboard'
  | 'tasks'
  | 'collections'
  | 'vault'
  | 'files'
  | 'notes'
  | 'timeline'
  | 'data'
  | 'settings'

// ---------- Tasks ----------

export interface Task {
  id: ID
  title: string
  notes: string
  priority: Priority
  /** YYYY-MM-DD（本地日期），null 表示无截止日期 */
  dueDate: string | null
  /** HH:mm，null 表示无截止时间 */
  dueTime: string | null
  completed: boolean
  completedAt: string | null
  isImportant: boolean
  /** 列表内排序权重（REAL），拖拽排序持久化 */
  sortOrder: number
  /** 自定义提醒：null=默认策略；0=到期时；N=提前 N 分钟 */
  reminderMinutes: number | null
  createdAt: string
  updatedAt: string
}

export interface TaskInput {
  title: string
  notes?: string
  priority?: Priority
  dueDate?: string | null
  dueTime?: string | null
  isImportant?: boolean
  reminderMinutes?: number | null
}

export type TaskView = 'today' | 'upcoming' | 'completed' | 'all'

export interface TaskFilter {
  view: TaskView
  priority?: Priority | 'all'
  date?: string | null
  search?: string
}

// ---------- Collections ----------

export type CollectionType =
  | 'website'
  | 'github'
  | 'bilibili'
  | 'youtube'
  | 'forum'
  | 'article'
  | 'custom'

export const COLLECTION_TYPES: CollectionType[] = [
  'website',
  'github',
  'bilibili',
  'youtube',
  'forum',
  'article',
  'custom'
]

export type ResearchStatus = 'unresearched' | 'researching' | 'done'

export const RESEARCH_STATUSES: ResearchStatus[] = ['unresearched', 'researching', 'done']

export interface Collection {
  id: ID
  name: string
  url: string
  type: CollectionType
  description: string
  note: string
  /** JSON 序列化的字符串数组 */
  tags: string[]
  importance: Priority
  researchStatus: ResearchStatus
  favicon: string | null
  previewImage: string | null
  /** 自定义分组（V3），null = 未分组 */
  groupId: string | null
  createdAt: string
  updatedAt: string
}

export interface CollectionGroup {
  id: ID
  name: string
  sortOrder: number
  createdAt: string
}

export interface CollectionHistoryEntry {
  id: ID
  collectionId: ID
  changedAt: string
  /** 修改前的完整快照 */
  snapshot: Collection
}

export interface CollectionStats {
  total: number
  byType: Array<{ type: string; count: number }>
  byStatus: Array<{ status: string; count: number }>
  topTags: Array<{ tag: string; count: number }>
  duplicates: Array<{ url: string; count: number }>
}

export type CollectionSortBy = 'created_desc' | 'created_asc' | 'updated_desc' | 'name_asc' | 'importance'

export interface CollectionInput {
  name: string
  url: string
  type?: CollectionType
  description?: string
  note?: string
  tags?: string[]
  importance?: Priority
  researchStatus?: ResearchStatus
  /** 自定义分组（V3） */
  groupId?: string | null
}

/** 粘贴 URL 后由主进程抓取的网页元数据（内容仅作为数据处理，绝不作为指令执行） */
export interface UrlMeta {
  url: string
  title: string | null
  description: string | null
  favicon: string | null
  previewImage: string | null
  /** 抓取失败或超时时的原因说明 */
  error?: string
}

// ---------- File Index ----------

export interface FileIndexItem {
  id: ID
  name: string
  path: string
  fileType: string
  size: number | null
  version: string
  notes: string
  tags: string[]
  lastCheckedAt: string | null
  isInvalid: boolean
  /** 来源设备标识（V3）：windows 路径仅原设备有效，跨平台时保留为历史索引 */
  originDevice: string
  createdAt: string
  updatedAt: string
}

export interface FileIndexStats {
  total: number
  totalSize: number
  invalidCount: number
  byType: Array<{ fileType: string; count: number; size: number }>
  recentAdded: number
  duplicatePaths: string[]
}

export interface ScanOptions {
  directory: string
  extensions: string[]
  /** 最大深度，0 = 仅该目录 */
  maxDepth: number
  /** 扫描文件数量上限（安全限制） */
  maxFiles: number
}

export interface ScanProgress {
  scanned: number
  matched: number
  currentDir: string
  finished: boolean
  cancelled: boolean
}

export interface ScanResult {
  files: Array<{ path: string; name: string; fileType: string; size: number }>
  cancelled: boolean
}

// ---------- 数据管理中心 ----------

export interface DatabaseIntegrityReport {
  integrity: 'ok' | 'failed'
  message: string
  foreignKeyViolations: number
  schemaVersion: number
  migrations: Array<{ id: string; fromVersion: number; toVersion: number; executedAt: string; description: string }>
}

// ---------- Timeline 阶段三 ----------

export interface MonthlyTaskStat {
  month: string // YYYY-MM
  completed: number
}

export interface TypeDistribution {
  type: string
  count: number
}

export interface TagUsage {
  tag: string
  count: number
}

export interface FileCheckResult {
  exists: boolean
  size: number | null
  checkedAt: string
}

// ---------- Notes ----------

export interface Note {
  id: ID
  title: string
  content: string
  category: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface NoteAttachment {
  id: ID
  noteId: ID
  fileName: string
  /** attachments 目录内的存储文件名 */
  storedName: string
  mime: string
  size: number
  createdAt: string
}

export interface NoteInput {
  title: string
  content: string
  category?: string
  tags?: string[]
}

// ---------- Private Vault ----------

export type VaultCategory =
  | 'website_account'
  | 'developer_account'
  | 'api_keys'
  | 'servers'
  | 'databases'
  | 'private_notes'

export const VAULT_CATEGORIES: VaultCategory[] = [
  'website_account',
  'developer_account',
  'api_keys',
  'servers',
  'databases',
  'private_notes'
]

/** 保险箱条目（仅解锁后由主进程内存持有，明文只在用户明确请求时出库） */
export interface VaultItem {
  id: ID
  name: string
  username: string
  secret: string
  url: string
  notes: string
  category: VaultCategory
  createdAt: string
  updatedAt: string
}

export interface VaultItemInput {
  name: string
  username?: string
  secret?: string
  url?: string
  notes?: string
  category?: VaultCategory
}

export type VaultState = 'no_vault' | 'locked' | 'unlocked'

/** 保险箱状态摘要（不含任何敏感数据） */
export interface VaultStatus {
  state: VaultState
  itemCount: number
  autoLockMinutes: number
  /** 加密元数据（非敏感）：算法与 KDF 参数 */
  algo: string | null
  kdf: { name: string; memoryKiB: number; iterations: number; parallelism: number } | null
  updatedAt: string | null
}

// ---------- Timeline ----------

export interface DailyCount {
  date: string // YYYY-MM-DD
  count: number
}

export interface TimelineActivity {
  id: number
  type: string
  refId: string | null
  title: string
  createdAt: string
}

export interface TimelineStats {
  tasks: DailyCount[]
  collections: DailyCount[]
  notes: DailyCount[]
  files: DailyCount[]
  activities: TimelineActivity[]
  /** 阶段三扩展 */
  monthlyTasks: MonthlyTaskStat[]
  typeDistribution: TypeDistribution[]
  tagUsage: TagUsage[]
}

// ---------- Dashboard ----------

export interface DashboardStats {
  date: string
  weekday: string
  tasksTotal: number
  tasksDone: number
  collectionCount: number
  fileCount: number
  noteCount: number
  importantTasks: Task[]
  recentCollections: Collection[]
  recentFiles: FileIndexItem[]
  recentNotes: Note[]
}

// ---------- 全局快速添加 ----------

export type QuickAddKind = 'task' | 'note' | 'url' | 'github' | 'file'

export interface QuickAddParse {
  kind: QuickAddKind
  /** 识别出的 URL / 文件路径 */
  value: string
  /** 对用户的说明 */
  hint: string
}

// ---------- 通知中心 ----------

export interface NotificationItem {
  id: string
  kind: 'success' | 'error' | 'info' | 'reminder'
  title: string
  body: string
  createdAt: string
}

// ---------- 备份历史 ----------

export interface BackupHistoryItem {
  fileName: string
  filePath: string
  sizeBytes: number
  createdAt: string
  appVersion: string | null
  schemaVersion: number | null
  formatVersion: number | null
  includesVault: boolean | null
  counts: { tasks: number; collections: number; notes: number; files: number; attachments: number } | null
  /** 完整性检查结果：null = 尚未检查 */
  integrity: 'ok' | 'failed' | null
  integrityMessage: string | null
  /** 是否为自动备份生成的文件 */
  isAuto: boolean
}

// ---------- Backup (.mydeskpack) ----------

export interface BackupManifest {
  app: 'MyDesk'
  /** 备份格式版本（结构变化时递增） */
  formatVersion: number
  appVersion: string
  schemaVersion: number
  createdAt: string
  files: Record<string, string>
  /** 保险箱数据是否包含在内（保持加密状态） */
  includesVault: boolean
}

export interface ImportPreview {
  formatVersion: number
  appVersion: string
  schemaVersion: number
  createdAt: string
  counts: {
    tasks: number
    collections: number
    notes: number
    files: number
    attachments: number
    vaultEncrypted: boolean
  }
  warnings: string[]
}

// ---------- Export ----------

export type ExportFormat = 'json' | 'csv-tasks' | 'csv-collections' | 'csv-files' | 'md-notes'

// ---------- App ----------

export interface AppInfo {
  version: string
  electronVersion: string
  nodeVersion: string
  schemaVersion: number
  dataDir: string
  dbPath: string
  platform: string
}

export interface GlobalSearchResult {
  module: 'tasks' | 'collections' | 'files' | 'notes'
  id: string
  title: string
  snippet: string
  /** 关键词在 title 中的位置（用于高亮），-1 表示不在标题中 */
  matchStart: number
  matchLength: number
}
