/**
 * Migration 003 — Collection groups / history + file origin (Schema V3)
 * MyDesk 1.2.0：收藏分组与修改历史、文件索引跨平台标识（纯新增，不影响现有数据）。
 */
import type { Migration } from '../migrator'

export const migration003: Migration = {
  id: '003_collection_groups_history',
  fromVersion: 2,
  toVersion: 3,
  description: 'Add collection_groups, collections.group_id, collection_history, file_index.origin_device',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS collection_groups (
        id         TEXT PRIMARY KEY,
        name       TEXT    NOT NULL,
        sort_order REAL    NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL
      );

      ALTER TABLE collections ADD COLUMN group_id TEXT REFERENCES collection_groups (id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_collections_group ON collections (group_id);

      /* 收藏修改历史：每次 update 前写入修改前的完整快照（JSON） */
      CREATE TABLE IF NOT EXISTS collection_history (
        id            TEXT PRIMARY KEY,
        collection_id TEXT    NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
        changed_at    TEXT    NOT NULL,
        snapshot      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_collection_history_col ON collection_history (collection_id);

      /* 文件索引的来源设备标识：Windows 路径只在本设备有效，
         跨平台迁移时作为"原设备历史索引"保留并允许重新映射 */
      ALTER TABLE file_index ADD COLUMN origin_device TEXT NOT NULL DEFAULT 'windows';
    `)
  }
}
