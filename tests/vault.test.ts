/**
 * 保险箱加密与安全测试。
 * 覆盖：设置/解锁/错误密码/CRUD 持久化/改密轮换/防篡改/数据库无明文。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { openDatabase } from '@database/connection'
import { migrate } from '@database/migrator'
import * as vault from '@main/services/vaultService'
import { createSession } from '@main/services/vaultService'

function freshDb(dir: string) {
  const db = openDatabase(join(dir, 'vault-test.db'))
  migrate(db)
  return db
}

describe('vault', () => {
  it('setup → unlock → items persist across sessions', async () => {
    let dir: string
    {
      dir = vaultDir()
      const db = openDatabase(join(dir, 'vault-test.db'))
      migrate(db)
      const session = createSession()
      await vault.setupVault(db, 'correct horse battery')
      await vault.unlockVault(db, session, 'correct horse battery')
      vault.addItem(session, { name: 'GitHub', username: 'octo', secret: 's3cret-token-xyz', category: 'developer_account' })
      vault.addItem(session, { name: 'Server', secret: 'root-password', category: 'servers' })
      vault.persistContainer(db, session)
      vault.wipeSession(session)
      db.close()
    }
    // 重新打开数据库（模拟重启）
    {
      const db = openDatabase(join(dir, 'vault-test.db'))
      const session = createSession()
      // 错误密码必须失败
      await expect(vault.unlockVault(db, session, 'wrong-password')).rejects.toThrow(/主密码错误/)
      // 正确密码解锁，数据完整
      await vault.unlockVault(db, session, 'correct horse battery')
      const items = vault.listItems(session)
      expect(items).toHaveLength(2)
      expect(items.find((i) => i.name === 'GitHub')?.secret).toBe('s3cret-token-xyz')
      expect(items.find((i) => i.name === 'Server')?.category).toBe('servers')
      vault.wipeSession(session)
      db.close()
    }
  })

  it('database file contains no plaintext secrets', async () => {
    const dir = vaultDir()
    const db = freshDb(dir)
    const session = createSession()
    const SECRET = 'SUPER-SECRET-API-KEY-12345'
    const USERNAME = 'neo-user-777'
    await vault.setupVault(db, 'master-pw-12345')
    await vault.unlockVault(db, session, 'master-pw-12345')
    vault.addItem(session, { name: 'MyApi', username: USERNAME, secret: SECRET })
    vault.persistContainer(db, session)
    // 强制 checkpoint 后读取原始文件
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()

    const raw = readFileSync(join(dir, 'vault-test.db')).toString('latin1')
    expect(raw).not.toContain(SECRET)
    expect(raw).not.toContain(USERNAME)
    expect(raw).not.toContain('master-pw-12345')
  })

  it('change master password rotates key (old password rejected, data intact)', async () => {
    const dir = vaultDir()
    const db = freshDb(dir)
    const session = createSession()
    await vault.setupVault(db, 'old-password-1')
    await vault.unlockVault(db, session, 'old-password-1')
    vault.addItem(session, { name: 'note1', secret: 'keep-me' })
    vault.persistContainer(db, session)

    await vault.changeMasterPassword(db, session, 'old-password-1', 'new-password-2')
    // 当前会话仍可用
    expect(vault.listItems(session)[0].secret).toBe('keep-me')
    vault.wipeSession(session)

    // 旧密码失败 / 新密码成功
    await expect(vault.unlockVault(db, createSession(), 'old-password-1')).rejects.toThrow(/主密码错误/)
    const s2 = createSession()
    await vault.unlockVault(db, s2, 'new-password-2')
    expect(vault.listItems(s2)).toHaveLength(1)
    expect(vault.listItems(s2)[0].secret).toBe('keep-me')
    db.close()
  })

  it('tampered ciphertext is rejected (GCM auth)', async () => {
    const dir = vaultDir()
    const db = freshDb(dir)
    const session = createSession()
    await vault.setupVault(db, 'tamper-test-pw')
    await vault.unlockVault(db, session, 'tamper-test-pw')
    vault.addItem(session, { name: 'x', secret: 'y' })
    vault.persistContainer(db, session)
    vault.wipeSession(session)
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()

    // 直接篡改密文 BLOB 的一个字节（数据库层，模拟存储损坏）
    const dbT = openDatabase(join(dir, 'vault-test.db'))
    const rowT = dbT.prepare(`SELECT data FROM vault_store WHERE id = 1`).get() as { data: Buffer }
    const tampered = Buffer.from(rowT.data)
    tampered[24] = tampered[24] ^ 0xff // 跳过 12 字节 nonce，翻转密文字节
    dbT.prepare(`UPDATE vault_store SET data = ? WHERE id = 1`).run(tampered)
    dbT.close()

    const db2 = openDatabase(join(dir, 'vault-test.db'))
    await expect(vault.unlockVault(db2, createSession(), 'tamper-test-pw')).rejects.toThrow(/主密码错误/)
    db2.close()
  })

  it('locked session rejects operations', async () => {
    const dir = vaultDir()
    const db = freshDb(dir)
    const session = createSession()
    await vault.setupVault(db, 'lock-check-pw')
    expect(() => vault.listItems(session)).toThrow(/已锁定/)
    vault.wipeSession(session)
    expect(() => vault.addItem(session, { name: 'x' })).toThrow(/已锁定/)
    db.close()
  })
})

function vaultDir(): string {
  const { mkdtempSync } = require('fs') as typeof import('fs')
  const { tmpdir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')
  const d = mkdtempSync(join(tmpdir(), 'mydesk-vault-'))
    return d
}
