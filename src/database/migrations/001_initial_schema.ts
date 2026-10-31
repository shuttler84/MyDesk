/**
 * Migration 001 — Initial Schema (Schema V1)
 * MyDesk 1.0.0 的初始数据库结构。
 */
import type { Migration } from '../migrator'

export const migration001: Migration = {
  id: '001_initial_schema',
  fromVersion: 0,
  toVersion: 1,
  description: 'Initial schema: tasks, collections, file_index, notes, note_attachments, vault_store, settings, activity_log, migration_history',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_id  TEXT    NOT NULL UNIQUE,
        from_version  INTEGER NOT NULL,
        to_version    INTEGER NOT NULL,
        description   TEXT    NOT NULL,
        script_hash   TEXT    NOT NULL,
        executed_at   TEXT    NOT NULL,
        success       INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id           TEXT PRIMARY KEY,
        title        TEXT    NOT NULL,
        notes        TEXT    NOT NULL DEFAULT '',
        priority     TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
        due_date     TEXT,
        due_time     TEXT,
        completed    INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        is_important INTEGER NOT NULL DEFAULT 0,
        sort_order   REAL    NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_completed_due ON tasks (completed, due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks (sort_order);

      CREATE TABLE IF NOT EXISTS collections (
        id              TEXT PRIMARY KEY,
        name            TEXT    NOT NULL,
        url             TEXT    NOT NULL,
        type            TEXT    NOT NULL DEFAULT 'website'
                        CHECK (type IN ('website','github','bilibili','youtube','forum','article','custom')),
        description     TEXT    NOT NULL DEFAULT '',
        note            TEXT    NOT NULL DEFAULT '',
        tags            TEXT    NOT NULL DEFAULT '[]',
        importance      TEXT    NOT NULL DEFAULT 'medium' CHECK (importance IN ('low','medium','high')),
        research_status TEXT    NOT NULL DEFAULT 'unresearched'
                        CHECK (research_status IN ('unresearched','researching','done')),
        favicon         TEXT,
        preview_image   TEXT,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_collections_type ON collections (type);
      CREATE INDEX IF NOT EXISTS idx_collections_created ON collections (created_at);

      CREATE TABLE IF NOT EXISTS file_index (
        id              TEXT PRIMARY KEY,
        name            TEXT    NOT NULL,
        path            TEXT    NOT NULL,
        file_type       TEXT    NOT NULL DEFAULT '',
        size            INTEGER,
        version         TEXT    NOT NULL DEFAULT '',
        notes           TEXT    NOT NULL DEFAULT '',
        tags            TEXT    NOT NULL DEFAULT '[]',
        last_checked_at TEXT,
        is_invalid      INTEGER NOT NULL DEFAULT 0,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_files_created ON file_index (created_at);

      CREATE TABLE IF NOT EXISTS notes (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT '',
        content    TEXT NOT NULL DEFAULT '',
        category   TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at);

      CREATE TABLE IF NOT EXISTS note_attachments (
        id          TEXT PRIMARY KEY,
        note_id     TEXT    NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
        file_name   TEXT    NOT NULL,
        stored_name TEXT    NOT NULL UNIQUE,
        mime        TEXT    NOT NULL DEFAULT 'application/octet-stream',
        size        INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_note ON note_attachments (note_id);

      /* 私密保险箱：整库容器加密（AES-256-GCM），数据库中不存在任何明文。
         data = nonce(12B) || ciphertext || tag(16B) */
      CREATE TABLE IF NOT EXISTS vault_store (
        id          INTEGER PRIMARY KEY CHECK (id = 1),
        data        BLOB    NOT NULL,
        salt        BLOB    NOT NULL,
        kdf_json    TEXT    NOT NULL,
        algo        TEXT    NOT NULL,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        type       TEXT    NOT NULL,
        ref_id     TEXT,
        title      TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at);
    `)
  }
}
