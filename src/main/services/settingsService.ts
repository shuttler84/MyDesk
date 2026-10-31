/**
 * 设置服务 — key-value 持久化，带类型安全的默认值。
 */
import type { DB } from '@database/connection'
import type { AppSettings, AnimationPref, ThemeName, PageId } from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'mint',
  animation: 'full',
  startPage: 'dashboard',
  vaultAutoLockMinutes: 10,
  clipboardClearSeconds: 30
}

const SETTING_KEYS = [
  'theme',
  'animation',
  'startPage',
  'vaultAutoLockMinutes',
  'clipboardClearSeconds'
] as const

function coerce<K extends keyof AppSettings>(key: K, raw: string | undefined): AppSettings[K] {
  const def = DEFAULT_SETTINGS[key]
  if (raw === undefined) return def
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === typeof def) return parsed as AppSettings[K]
  } catch {
    /* fallthrough */
  }
  return def
}

export function getSettings(db: DB): AppSettings {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{
    key: string
    value: string
  }>
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    theme: coerce('theme', map.get('theme')) as ThemeName,
    animation: coerce('animation', map.get('animation')) as AnimationPref,
    startPage: coerce('startPage', map.get('startPage')) as PageId,
    vaultAutoLockMinutes: coerce('vaultAutoLockMinutes', map.get('vaultAutoLockMinutes')) as number,
    clipboardClearSeconds: coerce('clipboardClearSeconds', map.get('clipboardClearSeconds')) as number
  }
}

export function updateSettings(db: DB, patch: Partial<AppSettings>): AppSettings {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  const tx = () => {
    for (const key of SETTING_KEYS) {
      if (patch[key] !== undefined) {
        stmt.run(key, JSON.stringify(patch[key]))
      }
    }
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    tx()
    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
  return getSettings(db)
}
