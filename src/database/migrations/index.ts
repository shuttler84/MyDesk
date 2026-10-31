/**
 * 内置迁移注册表。
 * 新迁移规则：文件命名 NNN_description.ts，然后按顺序追加到数组末尾。
 */
import type { Migration } from '../migrator'
import { migration001 } from './001_initial_schema'
import { migration002 } from './002_task_reminders'
import { migration003 } from './003_collection_groups_history'

export const builtInMigrations: Migration[] = [migration001, migration002, migration003]

/** 当前最新 Schema Version */
export const LATEST_SCHEMA_VERSION = builtInMigrations[builtInMigrations.length - 1].toVersion
