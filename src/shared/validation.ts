/**
 * 所有 IPC 输入的统一校验（zod）。
 * 主进程收到的任何跨进程数据都必须先通过这里，再进入业务逻辑。
 */
import { z } from 'zod'

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

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(10000).optional(),
  priority: prioritySchema.optional(),
  dueDate: localDate.nullable().optional(),
  dueTime: localTime.nullable().optional(),
  isImportant: z.boolean().optional()
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
  theme: z.enum(['mint', 'lavender', 'cream', 'midnight', 'glass']).optional(),
  animation: z.enum(['full', 'reduced', 'off']).optional(),
  startPage: z
    .enum(['dashboard', 'tasks', 'collections', 'vault', 'files', 'notes', 'timeline', 'settings'])
    .optional(),
  vaultAutoLockMinutes: z.number().int().min(1).max(1440).optional(),
  clipboardClearSeconds: z.number().int().min(5).max(600).optional()
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
