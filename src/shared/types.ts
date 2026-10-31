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

export interface AppSettings {
  theme: ThemeName
  animation: AnimationPref
  startPage: PageId
  vaultAutoLockMinutes: number
  clipboardClearSeconds: number
}

export type PageId =
  | 'dashboard'
  | 'tasks'
  | 'collections'
  | 'vault'
  | 'files'
  | 'notes'
  | 'timeline'
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
  createdAt: string
  updatedAt: string
}

export interface CollectionInput {
  name: string
  url: string
  type?: CollectionType
  description?: string
  note?: string
  tags?: string[]
  importance?: Priority
  researchStatus?: ResearchStatus
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
  createdAt: string
  updatedAt: string
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
}
