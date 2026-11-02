/**
 * 设置服务 — key-value 持久化，带类型安全的默认值。
 */
import type { DB } from '@database/connection'
import type {
  AppSettings,
  AnimationPref,
  ThemeName,
  PageId,
  TrayCloseBehavior,
  AutoBackupFrequency
} from '@shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'claude',
  animation: 'full',
  startPage: 'dashboard',
  vaultAutoLockMinutes: 10,
  clipboardClearSeconds: 30,
  trayCloseBehavior: 'ask',
  launchOnStartup: false,
  autoBackupEnabled: false,
  autoBackupFrequency: 'daily',
  autoBackupKeepCount: 10,
  quietStart: null,
  quietEnd: null,
  defaultReminderMinutes: null,
  extensionEnabled: false,
  fontFamily: 'system',
  headingFont: 'theme'
}

const SETTING_KEYS = [
  'theme',
  'animation',
  'startPage',
  'vaultAutoLockMinutes',
  'clipboardClearSeconds',
  'trayCloseBehavior',
  'launchOnStartup',
  'autoBackupEnabled',
  'autoBackupFrequency',
  'autoBackupKeepCount',
  'quietStart',
  'quietEnd',
  'defaultReminderMinutes',
  'extensionEnabled',
  'fontFamily',
  'headingFont'
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
    clipboardClearSeconds: coerce('clipboardClearSeconds', map.get('clipboardClearSeconds')) as number,
    trayCloseBehavior: coerce('trayCloseBehavior', map.get('trayCloseBehavior')) as TrayCloseBehavior,
    launchOnStartup: coerce('launchOnStartup', map.get('launchOnStartup')) as boolean,
    autoBackupEnabled: coerce('autoBackupEnabled', map.get('autoBackupEnabled')) as boolean,
    autoBackupFrequency: coerce('autoBackupFrequency', map.get('autoBackupFrequency')) as AutoBackupFrequency,
    autoBackupKeepCount: coerce('autoBackupKeepCount', map.get('autoBackupKeepCount')) as number,
    quietStart: (map.get('quietStart') !== undefined ? coerce('quietStart', map.get('quietStart')) : null) as string | null,
    quietEnd: (map.get('quietEnd') !== undefined ? coerce('quietEnd', map.get('quietEnd')) : null) as string | null,
    defaultReminderMinutes: (map.get('defaultReminderMinutes') !== undefined
      ? coerce('defaultReminderMinutes', map.get('defaultReminderMinutes'))
      : null) as number | null,
    extensionEnabled: coerce('extensionEnabled', map.get('extensionEnabled')) as boolean,
    fontFamily: coerce('fontFamily', map.get('fontFamily')) as AppSettings['fontFamily'],
    headingFont: coerce('headingFont', map.get('headingFont')) as AppSettings['headingFont']
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
