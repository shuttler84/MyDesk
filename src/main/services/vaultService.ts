/**
 * 私密保险箱加密核心 — 平台无关。
 *
 * 设计：
 * - 主密码通过 Argon2id（hash-wasm，成熟 WASM 实现）派生 256 位密钥。
 * - 数据使用 AES-256-GCM（Node 内置 crypto，认证加密）整容器加密。
 * - 数据库中只保存  nonce || ciphertext || tag 二进制与 KDF 参数，绝无明文。
 * - 派生密钥只存在于主进程内存，永不持久化。
 *
 * 加密格式版本（VAULT_FORMAT_VERSION）独立管理；修改加密结构时必须提供升级方案。
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual
} from 'crypto'
import { argon2id } from 'hash-wasm'
import type { DB } from '@database/connection'
import type { VaultItem, VaultItemInput } from '@shared/types'
import { withTransaction } from '@database/connection'
import { nowIso, newId } from './context'

// ---------- 常量（加密元数据） ----------

/** 加密容器格式版本 */
export const VAULT_FORMAT_VERSION = 1
export const VAULT_ALGO = 'AES-256-GCM'
/** AAD：绑定格式版本，防止密文跨版本误用 */
const AAD = Buffer.from(`mydesk-vault:v${VAULT_FORMAT_VERSION}`)

/** Argon2id 参数（OWASP 推荐量级：64 MiB / t=3 / p=4，NIST 认可的 memory-hard KDF） */
export const KDF_PARAMS = {
  name: 'argon2id',
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 4,
  hashLength: 32,
  saltBytes: 16,
  nonceBytes: 12
} as const

// ---------- 容器 ----------

export interface VaultContainer {
  formatVersion: number
  items: VaultItem[]
}

interface VaultRow {
  data: Buffer
  salt: Buffer
  kdf_json: string
  algo: string
  created_at: string
  updated_at: string
}

/** data = nonce(12) || ciphertext || tag(16) */
export function encryptContainer(container: VaultContainer, key: Buffer): { data: Buffer; nonce: Buffer } {
  const nonce = randomBytes(KDF_PARAMS.nonceBytes)
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
  cipher.setAAD(AAD)
  const plaintext = Buffer.from(JSON.stringify(container), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return { data: Buffer.concat([nonce, ciphertext, tag]), nonce }
}

export function decryptContainer(data: Buffer, key: Buffer): VaultContainer {
  const nonce = data.subarray(0, KDF_PARAMS.nonceBytes)
  const tag = data.subarray(data.length - 16)
  const ciphertext = data.subarray(KDF_PARAMS.nonceBytes, data.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 })
  decipher.setAAD(AAD)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  const parsed = JSON.parse(plaintext.toString('utf8')) as VaultContainer
  if (!parsed || typeof parsed.formatVersion !== 'number' || !Array.isArray(parsed.items)) {
    throw new Error('保险箱容器格式无效')
  }
  return parsed
}

export async function deriveKey(masterPassword: string, salt: Buffer): Promise<Buffer> {
  const hash = await argon2id({
    password: masterPassword,
    salt: new Uint8Array(salt),
    parallelism: KDF_PARAMS.parallelism,
    iterations: KDF_PARAMS.iterations,
    memorySize: KDF_PARAMS.memoryKiB,
    hashLength: KDF_PARAMS.hashLength,
    outputType: 'binary'
  })
  return Buffer.from(hash)
}

/** 常数时间比较两个派生密钥（用于解锁验证） */
export function keysEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------- 会话（主进程内存态） ----------

export interface VaultSession {
  key: Buffer | null
  container: VaultContainer | null
  /** 最后一次操作时间，用于闲置自动锁定 */
  lastActivity: number
}

export function createSession(): VaultSession {
  return { key: null, container: null, lastActivity: Date.now() }
}

export function touchSession(s: VaultSession): void {
  s.lastActivity = Date.now()
}

export function wipeSession(s: VaultSession): void {
  if (s.key) {
    s.key.fill(0) // 主动擦除内存中的密钥
  }
  s.key = null
  s.container = null
}

export function isUnlocked(s: VaultSession): boolean {
  return s.key !== null && s.container !== null
}

// ---------- 持久化操作 ----------

export function getVaultRow(db: DB): VaultRow | null {
  const row = db.prepare(`SELECT * FROM vault_store WHERE id = 1`).get() as unknown as
    | VaultRow
    | undefined
  return row ?? null
}

export async function setupVault(db: DB, masterPassword: string): Promise<void> {
  if (getVaultRow(db)) throw new Error('保险箱已存在')
  const salt = randomBytes(KDF_PARAMS.saltBytes)
  const key = await deriveKey(masterPassword, salt)
  const container: VaultContainer = { formatVersion: VAULT_FORMAT_VERSION, items: [] }
  const { data } = encryptContainer(container, key)
  key.fill(0)
  const now = nowIso()
  db.prepare(
    `INSERT INTO vault_store (id, data, salt, kdf_json, algo, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)`
  ).run(data, salt, JSON.stringify({ ...KDF_PARAMS }), VAULT_ALGO, now, now)
}

/** 验证主密码并解锁会话。密码错误时抛出（GCM 认证失败）。 */
export async function unlockVault(
  db: DB,
  s: VaultSession,
  masterPassword: string
): Promise<VaultContainer> {
  const row = getVaultRow(db)
  if (!row) throw new Error('保险箱尚未创建')
  const kdf = JSON.parse(row.kdf_json) as typeof KDF_PARAMS
  const key = await deriveKeyWithParams(masterPassword, Buffer.from(row.salt), kdf)
  let container: VaultContainer
  try {
    container = decryptContainer(Buffer.from(row.data), key)
  } catch {
    key.fill(0)
    throw new Error('主密码错误')
  }
  wipeSession(s)
  s.key = key
  s.container = container
  s.lastActivity = Date.now()
  return container
}

export async function deriveKeyWithParams(
  masterPassword: string,
  salt: Buffer,
  kdf: {
    memoryKiB: number
    iterations: number
    parallelism: number
    hashLength: number
  }
): Promise<Buffer> {
  const hash = await argon2id({
    password: masterPassword,
    salt: new Uint8Array(salt),
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    hashLength: kdf.hashLength,
    outputType: 'binary'
  })
  return Buffer.from(hash)
}

/** 将内存中的容器重新加密写回数据库（每次修改后调用） */
export function persistContainer(db: DB, s: VaultSession): void {
  if (!s.key || !s.container) throw new Error('保险箱已锁定')
  const { data } = encryptContainer(s.container, s.key)
  db.prepare(`UPDATE vault_store SET data = ?, updated_at = ? WHERE id = 1`).run(data, nowIso())
}

/**
 * 主密码更改（密钥轮换）：旧密码验证 → 新 salt 派生新密钥 → 重新加密全部数据 → 持久化。
 * 整个过程不解密到磁盘，失败时旧数据保持不变。
 */
export async function changeMasterPassword(
  db: DB,
  s: VaultSession,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const row = getVaultRow(db)
  if (!row) throw new Error('保险箱尚未创建')
  const kdf = JSON.parse(row.kdf_json) as typeof KDF_PARAMS
  const currentKey = await deriveKeyWithParams(currentPassword, Buffer.from(row.salt), kdf)
  // 验证旧密码：用旧密钥解密（GCM 认证会拒绝错误密码）
  try {
    decryptContainer(Buffer.from(row.data), currentKey)
  } catch {
    currentKey.fill(0)
    throw new Error('当前主密码不正确')
  }

  const newSalt = randomBytes(KDF_PARAMS.saltBytes)
  const newKey = await deriveKey(newPassword, newSalt)
  const { data } = encryptContainer(s.container!, newKey)
  withTransaction(db, () => {
    db.prepare(`UPDATE vault_store SET data = ?, salt = ?, kdf_json = ?, updated_at = ? WHERE id = 1`).run(
      data,
      newSalt,
      JSON.stringify({ ...KDF_PARAMS }),
      nowIso()
    )
  })
  // 切换会话密钥
  if (s.key) s.key.fill(0)
  s.key = newKey
  s.lastActivity = Date.now()
  currentKey.fill(0)
}

// ---------- 条目 CRUD（全部经由加密容器） ----------

function assertUnlocked(s: VaultSession): asserts s is VaultSession & { key: Buffer; container: VaultContainer } {
  if (!isUnlocked(s)) throw new Error('保险箱已锁定')
}

export function listItems(s: VaultSession): VaultItem[] {
  assertUnlocked(s)
  return s.container.items
}

export function addItem(s: VaultSession, input: VaultItemInput): VaultItem {
  assertUnlocked(s)
  const now = nowIso()
  const item: VaultItem = {
    id: newId(),
    name: input.name,
    username: input.username ?? '',
    secret: input.secret ?? '',
    url: input.url ?? '',
    notes: input.notes ?? '',
    category: input.category ?? 'website_account',
    createdAt: now,
    updatedAt: now
  }
  s.container.items.push(item)
  return item
}

export function updateItem(s: VaultSession, id: string, patch: Partial<VaultItemInput>): VaultItem {
  assertUnlocked(s)
  const item = s.container.items.find((i) => i.id === id)
  if (!item) throw new Error('保险箱条目不存在')
  if (patch.name !== undefined) item.name = patch.name
  if (patch.username !== undefined) item.username = patch.username
  if (patch.secret !== undefined) item.secret = patch.secret
  if (patch.url !== undefined) item.url = patch.url
  if (patch.notes !== undefined) item.notes = patch.notes
  if (patch.category !== undefined) item.category = patch.category
  item.updatedAt = nowIso()
  return item
}

export function deleteItem(s: VaultSession, id: string): void {
  assertUnlocked(s)
  const idx = s.container.items.findIndex((i) => i.id === id)
  if (idx === -1) throw new Error('保险箱条目不存在')
  s.container.items.splice(idx, 1)
}

export function getSecret(s: VaultSession, id: string): string {
  assertUnlocked(s)
  const item = s.container.items.find((i) => i.id === id)
  if (!item) throw new Error('保险箱条目不存在')
  return item.secret
}
