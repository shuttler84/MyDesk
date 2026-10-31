-- MyDesk Schema V2 (migration 002_task_reminders)
-- 此文件为存档；权威实现见 src/database/migrations/002_task_reminders.ts

-- 自定义提醒时间：null = 使用默认提醒策略；0 = 到期时；N = 提前 N 分钟
ALTER TABLE tasks ADD COLUMN reminder_minutes INTEGER;

CREATE TABLE IF NOT EXISTS reminder_log (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL DEFAULT 'due',
  reminded_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminder_log_task ON reminder_log (task_id);
