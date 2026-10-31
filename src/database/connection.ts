/**
 * SQLite 连接层 — 基于 Node/Electron 内置的 node:sqlite（DatabaseSync）。
 * 不依赖任何原生编译模块，保证在 Windows / 未来的 Android 适配中零构建成本。
 */
import { DatabaseSync } from 'node:sqlite'

export interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  get<T = unknown>(...params: unknown[]): T | undefined
  all<T = unknown>(...params: unknown[]): T[]
}

export interface DB {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

/**
 * 打开 SQLite 连接并设置安全的 PRAGMA。
 * - WAL 模式：读写并发 + 崩溃安全
 * - foreign_keys ON：引用完整性
 * - busy_timeout：避免偶发锁冲突
 */
export function openDatabase(dbPath: string): DB {
  const db = new DatabaseSync(dbPath) as unknown as DB
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}

export function closeDatabase(db: DB): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } catch {
    // 忽略 checkpoint 失败，仍需关闭连接
  }
  db.close()
}

export function getUserVersion(db: DB): number {
  const row = db.prepare('PRAGMA user_version').get<{ user_version: number }>()
  return row?.user_version ?? 0
}

export function setUserVersion(db: DB, version: number): void {
  db.exec(`PRAGMA user_version = ${Number(version)}`)
}

/** 事务包装：出错时回滚并重新抛出 */
export function withTransaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 回滚失败时仅透传原始错误
    }
    throw err
  }
}

/**
 * 生成数据库一致性快照（SQLite Backup API 的等效机制）。
 * `VACUUM INTO` 在隐式事务中读取数据库，正确处理 WAL 与进行中的事务，
 * 输出一个紧凑、完整、独立的数据库文件。绝不简单复制正在使用的 db 文件。
 */
export function vacuumSnapshot(db: DB, targetPath: string): void {
  db.exec(`VACUUM INTO '${targetPath.replace(/'/g, "''")}'`)
}
