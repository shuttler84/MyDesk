-- MyDesk Schema V3 (migration 003_collection_groups_history)
-- 此文件为存档；权威实现见 src/database/migrations/003_collection_groups_history.ts

CREATE TABLE IF NOT EXISTS collection_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT    NOT NULL,
  sort_order REAL    NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

ALTER TABLE collections ADD COLUMN group_id TEXT REFERENCES collection_groups (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_collections_group ON collections (group_id);

CREATE TABLE IF NOT EXISTS collection_history (
  id            TEXT PRIMARY KEY,
  collection_id TEXT    NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  changed_at    TEXT    NOT NULL,
  snapshot      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collection_history_col ON collection_history (collection_id);

ALTER TABLE file_index ADD COLUMN origin_device TEXT NOT NULL DEFAULT 'windows';
