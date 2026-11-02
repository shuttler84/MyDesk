/**
 * 所有 IPC 输入的统一校验（zod）。
 * 主进程收到的任何跨进程数据都必须先通过这里，再进入业务逻辑。
 */
import { z } from 'zod'
import type { ThemeName } from './types'
import { THEME_IDS } from './themes'

// ---------- 基础 ----------

export const idSchema = z.string().uuid()

const isoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid ISO datetime')

/** 本地日期 YYYY-MM-DD */
export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
/** 本地时间 HH:mm */
export const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm')

export const prioritySchema = z.enum(['low', 'medium', 'high'])

// ---------- Tasks ----------

const reminderMinutesSchema = z.number().int().min(0).max(10080).nullable()

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(10000).optional(),
  priority: prioritySchema.optional(),
  dueDate: localDate.nullable().optional(),
  dueTime: localTime.nullable().optional(),
  isImportant: z.boolean().optional(),
  reminderMinutes: reminderMinutesSchema.optional()
})

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  id: idSchema
})

export const taskReorderSchema = z.object({
  /** 按新顺序排列的任务 id 列表 */
  ids: z.array(idSchema).min(1).max(1000)
})

// ---------- Collections ----------

export const collectionTypeSchema = z.enum([
  'website',
  'github',
  'bilibili',
  'youtube',
  'forum',
  'article',
  'custom'
])

export const researchStatusSchema = z.enum(['unresearched', 'researching', 'done'])

const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(30)

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  url: z.string().trim().url().max(2048),
  type: collectionTypeSchema.optional(),
  description: z.string().max(2000).optional(),
  note: z.string().max(5000).optional(),
  tags: tagsSchema.optional(),
  importance: prioritySchema.optional(),
  researchStatus: researchStatusSchema.optional()
})

export const collectionUpdateSchema = collectionCreateSchema.partial().extend({
  id: idSchema,
  // favicon / previewImage 可被编辑或清空
  favicon: z.string().max(2048).nullable().optional(),
  previewImage: z.string().max(2048).nullable().optional()
})

export const urlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u), 'only http/https URLs are allowed')

// ---------- Vault ----------

export const vaultCategorySchema = z.enum([
  'website_account',
  'developer_account',
  'api_keys',
  'servers',
  'databases',
  'private_notes'
])

export const masterPasswordSchema = z.string().min(8).max(200)

export const vaultSetupSchema = z.object({
  masterPassword: masterPasswordSchema
})

export const vaultUnlockSchema = z.object({
  masterPassword: z.string().min(1).max(200)
})

export const vaultCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  username: z.string().max(300).optional(),
  secret: z.string().max(10000).optional(),
  url: z.string().max(2048).optional(),
  notes: z.string().max(10000).optional(),
  category: vaultCategorySchema.optional()
})

export const vaultUpdateSchema = vaultCreateSchema.partial().extend({ id: idSchema })

export const vaultChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: masterPasswordSchema
})

// ---------- File Index ----------

const fileTagSchema = tagsSchema

export const fileCreateSchema = z.object({
  path: z.string().trim().min(1).max(1024),
  name: z.string().trim().max(300).optional(),
  version: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  tags: fileTagSchema.optional()
})

export const fileUpdateSchema = z.object({
  id: idSchema,
  name: z.string().trim().max(300).optional(),
  path: z.string().trim().min(1).max(1024).optional(),
  version: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).optional(),
  tags: fileTagSchema.optional(),
  isInvalid: z.boolean().optional()
})

// ---------- Notes ----------

export const noteCreateSchema = z.object({
  title: z.string().trim().max(300),
  content: z.string().max(500000),
  category: z.string().trim().max(100).optional(),
  tags: fileTagSchema.optional()
})

export const noteUpdateSchema = noteCreateSchema.partial().extend({ id: idSchema })

// ---------- Settings ----------

export const settingsPatchSchema = z.object({
  theme: z.enum(THEME_IDS as [ThemeName, ...ThemeName[]]).optional(),
  animation: z.enum(['full', 'reduced', 'off']).optional(),
  startPage: z
    .enum(['dashboard', 'tasks', 'collections', 'vault', 'files', 'notes', 'timeline', 'data', 'settings'])
    .optional(),
  vaultAutoLockMinutes: z.number().int().min(1).max(1440).optional(),
  clipboardClearSeconds: z.number().int().min(5).max(600).optional(),
  trayCloseBehavior: z.enum(['ask', 'tray', 'exit']).optional(),
  launchOnStartup: z.boolean().optional(),
  autoBackupEnabled: z.boolean().optional(),
  autoBackupFrequency: z.enum(['daily', 'weekly']).optional(),
  autoBackupKeepCount: z.number().int().min(1).max(100).optional(),
  quietStart: localTime.nullable().optional(),
  quietEnd: localTime.nullable().optional(),
  defaultReminderMinutes: reminderMinutesSchema.optional(),
  extensionEnabled: z.boolean().optional(),
  fontFamily: z.enum(['system', 'source-han', 'sarasa', 'lxgw']).optional(),
  headingFont: z.enum(['theme', 'serif', 'follow']).optional()
})

// ---------- Filter / search ----------

export const taskFilterSchema = z.object({
  view: z.enum(['today', 'upcoming', 'completed', 'all']),
  priority: z.enum(['low', 'medium', 'high', 'all']).optional(),
  date: localDate.nullable().optional(),
  search: z.string().max(200).optional()
})

export const globalSearchSchema = z.object({ query: z.string().trim().min(1).max(200) })

// ---------- Backup / export ----------

export const backupExportSchema = z.object({ filePath: z.string().min(1).max(1024) })

export const backupImportSchema = z.object({ filePath: z.string().min(1).max(1024) })

export const exportDataSchema = z.object({
  filePath: z.string().min(1).max(1024),
  format: z.enum(['json', 'csv-tasks', 'csv-collections', 'csv-files', 'md-notes'])
})

// ---------- 批量操作 / 备份中心 / 快速添加（阶段二） ----------

export const idsSchema = z.object({ ids: z.array(idSchema).min(1).max(500) })

export const batchTagsSchema = z.object({
  ids: z.array(idSchema).min(1).max(500),
  mode: z.enum(['replace', 'add']),
  tags: tagsSchema
})

export const batchAddFilesSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(1024)).min(1).max(100)
})

export const exportSelectedSchema = z.object({
  filePath: z.string().min(1).max(1024),
  ids: z.array(idSchema).min(1).max(500)
})

export const backupFileNameSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((n) => !n.includes('/') && !n.includes(String.fromCharCode(92)) && n.endsWith('.mydeskpack'), '必须是 .mydeskpack 文件名')
})

export const quickAddSaveSchema = z.object({
  kind: z.enum(['task', 'note', 'url', 'github', 'file']),
  text: z.string().trim().min(1).max(2000),
  extra: z.string().max(5000).optional()
})

// ---------- 阶段三 ----------

export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(100)
})

export const groupUpdateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.number().optional()
})

export const collectionSortSchema = z.object({
  sortBy: z.enum(['created_desc', 'created_asc', 'updated_desc', 'name_asc', 'importance']).optional(),
  /** 标签组合模式 */
  tagMode: z.enum(['and', 'or']).optional(),
  /** 分组筛选：null = 未分组，'all' = 全部 */
  groupId: idSchema.nullable().optional()
})

export const scanOptionsSchema = z.object({
  directory: z.string().trim().min(1).max(1024),
  extensions: z.array(z.string().trim().max(20)).max(30),
  maxDepth: z.number().int().min(0).max(10),
  maxFiles: z.number().int().min(1).max(5000)
})

export const scanCommitSchema = z.object({
  paths: z.array(z.string().trim().min(1).max(1024)).min(1).max(5000)
})

export const importCsvSchema = z.object({
  filePath: z.string().trim().min(1).max(1024)
})

export const extensionSaveSchema = z.object({
  url: z.string().trim().url().max(2048).refine((u) => /^https?:\/\//i.test(u), '仅支持 http/https'),
  title: z.string().trim().max(300),
  description: z.string().max(2000).optional(),
  note: z.string().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional()
})
