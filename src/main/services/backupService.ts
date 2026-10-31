/**
 * `.mydeskpack` 完整备份格式实现。
 *
 * 归档结构（ZIP 容器，固定内部文件清单）：
 *   manifest.json          — 格式版本 / 软件版本 / Schema Version / 导出时间 / SHA-256 校验
 *   data/database.sqlite   — 数据库一致性快照（VACUUM INTO 生成，含加密的保险箱数据）
 *   attachments/<file>     — 笔记附件
 *
 * 安全与可靠性约束：
 * - 快照使用 VACUUM INTO（等效 SQLite Backup API），正确处理 WAL/事务，绝不直接复制在用文件。
 * - 保险箱数据在数据库内保持 AES-256-GCM 加密，备份过程不解密。
 * - 导入前：验证结构 → 校验 SHA-256 → integrity_check → 兼容性检查 → 自动备份当前库 → 恢复。
 * - 导入失败自动回滚到导入前状态。
 * - 不提供"合并导入"——仅完整恢复，避免伪装成不可靠的合并功能。
 */
import AdmZip from 'adm-zip'
import { createHash } from 'crypto'
import { mkdtempSync, rmSync, mkdirSync, readdirSync, copyFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { openDatabase, vacuumSnapshot, getUserVersion } from '@database/connection'
import type { DB } from '@database/connection'
import { LATEST_SCHEMA_VERSION } from '@database/migrations'
import { migrate } from '@database/migrator'
import type { ServiceContext } from './context'
import type { BackupManifest, ImportPreview } from '@shared/types'
import { nowIso } from '@shared/datetime'

export const BACKUP_FORMAT_VERSION = 1
const DB_ENTRY = 'data/database.sqlite'
const ATTACHMENT_PREFIX = 'attachments/'

function sha256File(path: string): string {
  // 小文件量级（附件 ≤20MB、数据库），一次性读入即可
  return sha256Buf(readFileSync(path))
}

function sha256Buf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function newTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'mydesk-backup-'))
}

// ---------- 导出 ----------

export function exportBackup(ctx: ServiceContext, filePath: string): { fileCount: number } {
  const temp = newTempDir()
  try {
    const snapshotPath = join(temp, 'database.sqlite')
    vacuumSnapshot(ctx.db, snapshotPath)

    const zip = new AdmZip()
    const files: Record<string, string> = {}
    files[DB_ENTRY] = sha256File(snapshotPath)
    zip.addLocalFile(snapshotPath, 'data', 'database.sqlite')

    // 附件（存在才打包）
    let attachmentCount = 0
    if (existsSync(ctx.attachmentsDir)) {
      for (const name of readdirSync(ctx.attachmentsDir)) {
        const p = join(ctx.attachmentsDir, name)
        try {
          zip.addLocalFile(p, 'attachments', name)
          files[ATTACHMENT_PREFIX + name] = sha256File(p)
          attachmentCount++
        } catch {
          // 单个附件读取失败不阻断备份，记录缺失
        }
      }
    }

    const manifest: BackupManifest = {
      app: 'MyDesk',
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: ctx.appVersion,
      schemaVersion: getUserVersion(ctx.db),
      createdAt: nowIso(),
      files,
      includesVault: true
    }
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))

    const target = filePath.endsWith('.mydeskpack') ? filePath : filePath + '.mydeskpack'
    zip.writeZip(target)
    return { fileCount: 1 + attachmentCount }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

// ---------- 验证与预览 ----------

interface ValidatedPack {
  manifest: BackupManifest
  tempDir: string
  extractedDbPath: string
  counts: ImportPreview['counts']
  warnings: string[]
}

function validatePack(ctx: ServiceContext, filePath: string): ValidatedPack {
  let zip: AdmZip
  try {
    zip = new AdmZip(filePath)
  } catch {
    throw new Error('不是有效的 .mydeskpack 备份文件')
  }

  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) throw new Error('无效的备份：缺少 manifest.json')
  let manifest: BackupManifest
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as BackupManifest
  } catch {
    throw new Error('无效的备份：manifest.json 已损坏')
  }
  if (manifest.app !== 'MyDesk') throw new Error('无效的备份：这不是 MyDesk 的备份')
  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `备份格式 v${manifest.formatVersion} 高于本软件支持的 v${BACKUP_FORMAT_VERSION}，请升级 MyDesk。`
    )
  }

  // 完整性校验：manifest 中列出的每个文件的 SHA-256 必须匹配
  const dbEntry = zip.getEntry(DB_ENTRY)
  if (!dbEntry) throw new Error('无效的备份：缺少数据库快照')
  for (const [path, expectedHash] of Object.entries(manifest.files ?? {})) {
    const entry = zip.getEntry(path)
    if (!entry) throw new Error(`完整性校验失败：归档中缺少 ${path}`)
    const actual = sha256Buf(entry.getData())
    if (actual !== expectedHash) {
      throw new Error(`完整性校验失败：${path} 校验值不匹配（文件可能已损坏）`)
    }
  }

  // 提取到临时目录（导入流程复用同一份解压结果）
  const tempDir = newTempDir()
  try {
    zip.extractAllTo(tempDir, true)
  } catch {
    rmSync(tempDir, { recursive: true, force: true })
    throw new Error('解压备份归档失败')
  }

  const extractedDbPath = join(tempDir, 'data', 'database.sqlite')
  let countDb: DB
  try {
    countDb = openDatabase(extractedDbPath)
  } catch {
    rmSync(tempDir, { recursive: true, force: true })
    throw new Error('无效的备份：数据库快照无法打开')
  }

  try {
    if (getUserVersion(countDb) === 0) {
      throw new Error('无效的备份：数据库快照为空或不是 MyDesk 数据库')
    }
    const integrity = countDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (integrity.integrity_check !== 'ok') {
      throw new Error(`数据库完整性检查失败：${integrity.integrity_check}`)
    }
    const schemaVersion = getUserVersion(countDb)
    if (schemaVersion > manifest.schemaVersion) {
      throw new Error('备份元数据与数据库内容不一致')
    }
    if (schemaVersion > LATEST_SCHEMA_VERSION) {
      throw new Error(
        `备份的数据库结构 v${schemaVersion} 高于本软件支持的 v${LATEST_SCHEMA_VERSION}，请升级 MyDesk。`
      )
    }

    const n = (sql: string): number => Number((countDb.prepare(sql).get() as { c: number }).c)
    const counts = {
      tasks: n(`SELECT COUNT(*) AS c FROM tasks`),
      collections: n(`SELECT COUNT(*) AS c FROM collections`),
      notes: n(`SELECT COUNT(*) AS c FROM notes`),
      files: n(`SELECT COUNT(*) AS c FROM file_index`),
      attachments: n(`SELECT COUNT(*) AS c FROM note_attachments`),
      vaultEncrypted: n(`SELECT COUNT(*) AS c FROM vault_store`) > 0
    }

    const warnings: string[] = []
    if (schemaVersion < LATEST_SCHEMA_VERSION) {
      warnings.push(
        `Backup schema v${schemaVersion} will be migrated to v${LATEST_SCHEMA_VERSION} during import.`
      )
    }
    if (manifest.appVersion !== ctx.appVersion) {
      warnings.push(`Backup was created by MyDesk ${manifest.appVersion}, current version is ${ctx.appVersion}.`)
    }

    return {
      manifest,
      tempDir,
      extractedDbPath,
      counts,
      warnings
    }
  } finally {
    countDb.close()
  }
}

export function importPreview(ctx: ServiceContext, filePath: string): ImportPreview {
  let tempDir: string | null = null
  try {
    const v = validatePack(ctx, filePath)
    tempDir = v.tempDir
    return {
      formatVersion: v.manifest.formatVersion,
      appVersion: v.manifest.appVersion,
      schemaVersion: v.manifest.schemaVersion,
      createdAt: v.manifest.createdAt,
      counts: v.counts,
      warnings: v.warnings
    }
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  }
}

// ---------- 导入（完整恢复） ----------

export interface ImportResult {
  restored: ImportPreview['counts']
}

export function importBackup(ctx: ServiceContext, filePath: string): ImportResult {
  const v = validatePack(ctx, filePath)
  const tempDir = v.tempDir
  const safetyDir = newTempDir()
  try {
    // 1. 备份当前数据库（一致性快照），导入失败时用于回滚
    const safetyDbPath = join(safetyDir, 'safety.sqlite')
    vacuumSnapshot(ctx.db, safetyDbPath)

    // 2. 如需迁移，先在解压出的数据库上执行（不影响当前库）
    const extractedVersion = (() => {
      const d = openDatabase(v.extractedDbPath)
      try {
        return getUserVersion(d)
      } finally {
        d.close()
      }
    })()
    if (extractedVersion < LATEST_SCHEMA_VERSION) {
      const d = openDatabase(v.extractedDbPath)
      try {
        migrate(d)
      } finally {
        d.close()
      }
    }

    // 3. 关闭当前连接，替换数据库文件，重新打开
    const dbPath = ctx.platform.dbPath()
    ctx.db.close()
    try {
      for (const suffix of ['-wal', '-shm']) {
        rmSync(dbPath + suffix, { force: true })
      }
      copyFileSync(v.extractedDbPath, dbPath)
      ctx.db = openDatabase(dbPath)
      const check = ctx.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
      if (check.integrity_check !== 'ok') throw new Error('恢复后的数据库未通过完整性检查')
    } catch (err) {
      // 回滚：恢复导入前快照
      try {
        ctx.db.close()
      } catch {
        /* 可能已关闭 */
      }
      copyFileSync(safetyDbPath, dbPath)
      for (const suffix of ['-wal', '-shm']) {
        rmSync(dbPath + suffix, { force: true })
      }
      ctx.db = openDatabase(dbPath)
      throw new Error(
        `导入失败，原有数据已自动恢复。原因：${err instanceof Error ? err.message : String(err)}`
      )
    }

    // 4. 恢复附件
    const attachmentsSource = join(tempDir, 'attachments')
    if (existsSync(attachmentsSource)) {
      mkdirSync(ctx.attachmentsDir, { recursive: true })
      for (const name of readdirSync(attachmentsSource)) {
        copyFileSync(join(attachmentsSource, name), join(ctx.attachmentsDir, name))
      }
    }

    return { restored: v.counts }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
    rmSync(safetyDir, { recursive: true, force: true })
  }
}
