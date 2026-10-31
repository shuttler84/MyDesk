/**
 * 保险箱会话管理器（主进程持有）。
 * - 派生密钥只存在于本模块内存。
 * - 闲置超时自动锁定。
 * - 复制密钥后定时清理剪贴板。
 * - 状态摘要不包含任何敏感字段。
 */
import type { DB } from '@database/connection'
import type { VaultItem, VaultItemInput, VaultStatus, VaultCategory } from '@shared/types'
import {
  createSession,
  isUnlocked,
  wipeSession,
  touchSession,
  getVaultRow,
  setupVault,
  unlockVault,
  persistContainer,
  changeMasterPassword,
  listItems,
  addItem,
  updateItem,
  deleteItem,
  getSecret,
  VAULT_ALGO
} from './services/vaultService'
import { getSettings } from './services/settingsService'
import type { PlatformAdapter } from './platform/types'
import { logActivity } from './services/activityService'

export class VaultManager {
  readonly session = createSession()
  private clipboardClearTimer: NodeJS.Timeout | null = null

  /** 每次访问保险箱都刷新活动时间 */
  private touch(): void {
    touchSession(this.session)
  }

  status(db: DB): VaultStatus {
    const row = getVaultRow(db)
    const settings = getSettings(db)
    if (!row) {
      return {
        state: 'no_vault',
        itemCount: 0,
        autoLockMinutes: settings.vaultAutoLockMinutes,
        algo: null,
        kdf: null,
        updatedAt: null
      }
    }
    const kdf = JSON.parse(row.kdf_json) as {
      name: string
      memoryKiB: number
      iterations: number
      parallelism: number
    }
    return {
      state: isUnlocked(this.session) ? 'unlocked' : 'locked',
      itemCount: isUnlocked(this.session) ? this.session.container!.items.length : 0,
      autoLockMinutes: settings.vaultAutoLockMinutes,
      algo: row.algo || VAULT_ALGO,
      kdf: {
        name: kdf.name,
        memoryKiB: kdf.memoryKiB,
        iterations: kdf.iterations,
        parallelism: kdf.parallelism
      },
      updatedAt: row.updated_at
    }
  }

  async setup(db: DB, masterPassword: string): Promise<VaultStatus> {
    await setupVault(db, masterPassword)
    logActivity(db, 'vault_setup', null, 'Vault created')
    // 创建后自动进入解锁态（用户刚输入过主密码）
    await unlockVault(db, this.session, masterPassword)
    return this.status(db)
  }

  async unlock(db: DB, masterPassword: string): Promise<VaultStatus> {
    await unlockVault(db, this.session, masterPassword)
    logActivity(db, 'vault_unlocked', null, 'Vault unlocked')
    return this.status(db)
  }

  lock(): void {
    wipeSession(this.session)
  }

  /** 闲置自动锁定检查（主进程定时调用） */
  autoLockIfNeeded(db: DB): void {
    if (!isUnlocked(this.session)) return
    const settings = getSettings(db)
    const idleMs = Date.now() - this.session.lastActivity
    if (idleMs > settings.vaultAutoLockMinutes * 60_000) {
      this.lock()
    }
  }

  list(db: DB): VaultItem[] {
    this.touch()
    return listItems(this.session)
  }

  create(db: DB, input: VaultItemInput): VaultItem {
    this.touch()
    const item = addItem(this.session, input)
    persistContainer(db, this.session)
    return item
  }

  update(db: DB, id: string, patch: Partial<VaultItemInput>): VaultItem {
    this.touch()
    const item = updateItem(this.session, id, patch)
    persistContainer(db, this.session)
    return item
  }

  remove(db: DB, id: string): void {
    this.touch()
    deleteItem(this.session, id)
    persistContainer(db, this.session)
  }

  /** 取出密钥明文（仅在解锁状态；UI 上"点击显示"使用） */
  revealSecret(db: DB, id: string): string {
    this.touch()
    return getSecret(this.session, id)
  }

  /** 复制密钥到剪贴板并定时清理 */
  copySecret(db: DB, platform: PlatformAdapter, id: string): { clearedAfterSeconds: number } {
    this.touch()
    const secret = getSecret(this.session, id)
    platform.clipboardWriteText(secret)
    const settings = getSettings(db)
    if (this.clipboardClearTimer) clearTimeout(this.clipboardClearTimer)
    this.clipboardClearTimer = setTimeout(() => {
      // 仅当剪贴板内容仍是该密钥时才清空，避免误清用户后来的复制内容
      void platform
        .clipboardReadText()
        .then((current) => {
          if (current === secret) platform.clipboardWriteText('')
        })
        .catch(() => {
          /* ignore */
        })
    }, Math.max(5, settings.clipboardClearSeconds) * 1000)
    return { clearedAfterSeconds: settings.clipboardClearSeconds }
  }

  async changePassword(
    db: DB,
    currentPassword: string,
    newPassword: string
  ): Promise<VaultStatus> {
    this.touch()
    await changeMasterPassword(db, this.session, currentPassword, newPassword)
    return this.status(db)
  }
}

/** 保险箱分类显示名（渲染进程也可使用） */
export const VAULT_CATEGORY_LABELS: Record<VaultCategory, string> = {
  website_account: 'Website Accounts',
  developer_account: 'Developer Accounts',
  api_keys: 'API Keys / Tokens',
  servers: 'Servers',
  databases: 'Databases',
  private_notes: 'Private Notes'
}
