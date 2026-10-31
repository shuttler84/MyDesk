/**
 * Migration 002 — Reminder support (Schema V2)
 * MyDesk 1.1.0：任务提醒所需的结构（纯新增，不影响任何现有数据）。
 */
import type { Migration } from '../migrator'

export const migration002: Migration = {
  id: '002_task_reminders',
  fromVersion: 1,
  toVersion: 2,
  description: 'Add tasks.reminder_minutes and reminder_log table for task due reminders',
  up: (db) => {
    db.exec(`
      /* 自定义提醒时间：null = 使用默认提醒策略；0 = 到期时；N = 提前 N 分钟 */
      ALTER TABLE tasks ADD COLUMN reminder_minutes INTEGER;

      CREATE TABLE IF NOT EXISTS reminder_log (
        id          TEXT PRIMARY KEY,
        task_id     TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
        kind        TEXT    NOT NULL DEFAULT 'due',
        reminded_at TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reminder_log_task ON reminder_log (task_id);
    `)
  }
}
