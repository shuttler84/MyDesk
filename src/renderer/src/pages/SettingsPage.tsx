/**
 * Settings 设置中心：五种主题、动画选项、默认启动页、自动锁定、
 * 数据存储位置、备份/恢复（.mydeskpack）、JSON/CSV/Markdown 导出、关于。
 */
import { useEffect, useState } from 'react'
import {
  Palette,
  Sparkles,
  Rocket,
  Database,
  PackageOpen,
  FileJson,
  FileSpreadsheet,
  FileText,
  Info,
  Download,
  Upload,
  Bell,
  MonitorDown,
  ShieldCheck,
  Trash2,
  FolderOpen
} from 'lucide-react'
import type { BackupHistoryItem } from '@shared/types'
import { Toggle } from '../components/ui'
import { BackupCenterCards } from '../components/BackupCenterCards'
import { Puzzle } from 'lucide-react'
import { ExtensionSection } from '../components/ExtensionSection'
import type { AppInfo, ImportPreview, ThemeName } from '@shared/types'
import { api } from '../api/client'
import { useApp, THEME_LABELS } from '../store/AppStore'
import { Button, Card, Input, Modal, Select } from '../components/ui'

export function SettingsPage() {
  const { settings, patchSettings, toast } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [importPreview, setImportPreview] = useState<{ path: string; preview: ImportPreview } | null>(null)
  const [importing, setImporting] = useState(false)
  const [backups, setBackups] = useState<BackupHistoryItem[] | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)

  const refreshBackups = async (): Promise<void> => {
    try {
      setBackups(await api.backupCenter.list())
    } catch {
      setBackups([])
    }
  }

  useEffect(() => {
    void api.app.info().then(setInfo).catch(() => undefined)
    void refreshBackups()
  }, [])

  if (!settings) return null

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold text-text">设置</h1>

      {/* 主题 */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
          <Palette size={15} className="text-primary" /> 主题
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {(Object.keys(THEME_LABELS) as ThemeName[]).map((t) => (
            <button
              key={t}
              onClick={() => void patchSettings({ theme: t })}
              className={`rounded-2xl border-2 p-3 text-left transition-all ${
                settings.theme === t ? 'border-primary shadow-soft' : 'border-border hover:border-border-strong'
              }`}
            >
              <div
                className="mb-2 h-14 w-full rounded-xl border border-black/10"
                style={{ background: THEME_SWATCH[t] }}
              />
              <p className="text-xs font-medium text-text">{THEME_LABELS[t]}</p>
              {settings.theme === t && <p className="text-[10px] text-primary">使用中</p>}
            </button>
          ))}
        </div>
      </Card>

      {/* 动画与启动 */}
      <div className="grid grid-cols-2 gap-5">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
            <Sparkles size={15} className="text-accent" /> 动画
          </h3>
          <Select
            value={settings.animation}
            onChange={(v) => void patchSettings({ animation: v as 'full' | 'reduced' | 'off' })}
            options={[
              { value: 'full', label: '完整动画' },
              { value: 'reduced', label: '减少动画' },
              { value: 'off', label: '关闭动画（最佳性能）' }
            ]}
          />
          <p className="mt-2 text-xs text-text-3">减少或关闭动画以提升操作效率。</p>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
            <Rocket size={15} className="text-warning" /> 启动与保险箱
          </h3>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs text-text-2">默认启动页</span>
            <Select
              value={settings.startPage}
              onChange={(v) => void patchSettings({ startPage: v as typeof settings.startPage })}
              options={[
                { value: 'dashboard', label: '首页' },
                { value: 'tasks', label: '任务' },
                { value: 'collections', label: '收藏' },
                { value: 'vault', label: '保险箱' },
                { value: 'files', label: '文件索引' },
                { value: 'notes', label: '笔记' },
                { value: 'timeline', label: '时间轴' },
                { value: 'data', label: '数据管理' }
              ]}
            />
          </label>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs text-text-2">保险箱自动锁定（分钟）</span>
              <Input
                type="number"
                min={1}
                max={1440}
                value={String(settings.vaultAutoLockMinutes)}
                onChange={(v) => {
                  const n = parseInt(v, 10)
                  if (!Number.isNaN(n) && n >= 1 && n <= 1440) void patchSettings({ vaultAutoLockMinutes: n })
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs text-text-2">剪贴板清理（秒）</span>
              <Input
                type="number"
                min={5}
                max={600}
                value={String(settings.clipboardClearSeconds)}
                onChange={(v) => {
                  const n = parseInt(v, 10)
                  if (!Number.isNaN(n) && n >= 5 && n <= 600) void patchSettings({ clipboardClearSeconds: n })
                }}
              />
            </label>
          </div>
        </Card>
      </div>

      {/* 数据存储 */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
          <Database size={15} className="text-success" /> 数据存储
        </h3>
        <div className="mb-3 space-y-1 font-mono text-xs text-text-2">
          <p>数据目录：{info?.dataDir ?? '…'}</p>
          <p>数据库：{info?.dbPath ?? '…'}</p>
          <p>附件目录：{info?.dataDir ?? '…'}\attachments</p>
        </div>
        <p className="text-xs text-text-3">
          所有数据保存在本地 SQLite（WAL 模式），绝不上传。数据库结构版本：v{info?.schemaVersion ?? '…'}
        </p>
      </Card>

      <BackupCenterCards
        backups={backups}
        refreshBackups={refreshBackups}
        importPreview={importPreview}
        setImportPreview={setImportPreview}
        importing={importing}
        setImporting={setImporting}
      />

      {/* 浏览器扩展（阶段三） */}
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
          <Puzzle size={15} className="text-accent" /> 浏览器扩展（Chromium）
        </h3>
        <p className="mb-3 text-xs text-text-3">
          通过浏览器扩展一键收藏网页到 MyDesk。本地服务仅监听 127.0.0.1，需要令牌认证，不具备任何读取能力。
        </p>
        <ExtensionSection />
      </Card>

      {/* 导出 */}
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-semibold text-text">导出数据</h3>
        <p className="mb-3 text-xs text-text-3">
          普通导出绝不包含保险箱内容。保险箱数据只能通过加密的 .mydeskpack 备份离开本机。
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportBtn
            icon={<FileJson size={15} />}
            label="JSON（全部数据）"
            defaultName={`MyDesk导出-${new Date().toISOString().slice(0, 10)}.json`}
            filters={[{ name: 'JSON', extensions: ['json'] }]}
            format="json"
          />
          <ExportBtn
            icon={<FileSpreadsheet size={15} />}
            label="CSV —— 任务"
            defaultName="MyDesk任务.csv"
            filters={[{ name: 'CSV', extensions: ['csv'] }]}
            format="csv-tasks"
          />
          <ExportBtn
            icon={<FileSpreadsheet size={15} />}
            label="CSV —— 收藏"
            defaultName="MyDesk收藏.csv"
            filters={[{ name: 'CSV', extensions: ['csv'] }]}
            format="csv-collections"
          />
          <ExportBtn
            icon={<FileSpreadsheet size={15} />}
            label="CSV —— 文件索引"
            defaultName="MyDesk文件索引.csv"
            filters={[{ name: 'CSV', extensions: ['csv'] }]}
            format="csv-files"
          />
          <ExportBtn
            icon={<FileText size={15} />}
            label="Markdown —— 笔记"
            defaultName="MyDesk笔记.md"
            filters={[{ name: 'Markdown', extensions: ['md'] }]}
            format="md-notes"
          />
        </div>
      </Card>

      {/* 关于 */}
      <Card className="p-5">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
          <Info size={15} className="text-accent" /> 关于 MyDesk
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-text-2">
          <p>版本：<b>MyDesk {info?.version ?? '…'}</b></p>
          <p>数据库结构版本：<b>v{info?.schemaVersion ?? '…'}</b></p>
          <p>Electron: {info?.electronVersion ?? '…'}</p>
          <p>Node: {info?.nodeVersion ?? '…'}</p>
          <p>Platform: {info?.platform ?? '…'}</p>
          <p>许可证：MIT</p>
        </div>
        <p className="mt-3 text-xs text-text-3">
          MyDesk —— 你的个人数字空间。本地优先的个人数字工作台：任务、收藏、私密保险箱、文件索引与笔记，尽在一处。
        </p>
      </Card>

      {/* 恢复确认弹窗 */}
      <Modal
        open={importPreview !== null}
        onClose={() => setImportPreview(null)}
        title="恢复此备份？"
      >
        {importPreview && (
          <>
            <div className="mb-4 space-y-1 rounded-xl bg-surface-2 px-4 py-3 text-sm text-text-2">
              <p>创建时间：{new Date(importPreview.preview.createdAt).toLocaleString()}</p>
              <p>软件版本：{importPreview.preview.appVersion} · 备份格式 v{importPreview.preview.formatVersion} · 数据库结构 v{importPreview.preview.schemaVersion}</p>
              <p>
                任务 <b>{importPreview.preview.counts.tasks}</b> · 收藏 <b>{importPreview.preview.counts.collections}</b> ·
                笔记 <b>{importPreview.preview.counts.notes}</b> · 文件 <b>{importPreview.preview.counts.files}</b> ·
                附件 <b>{importPreview.preview.counts.attachments}</b>
              </p>
              <p>保险箱数据：{importPreview.preview.counts.vaultEncrypted ? '包含（保持加密）' : '不存在'}</p>
              {importPreview.preview.warnings.map((w, i) => (
                <p key={i} className="text-warning">⚠ {w}</p>
              ))}
            </div>
            <p className="mb-4 text-xs text-danger">
              这是完整恢复：当前数据将被备份内容替换。恢复前会自动为当前数据库创建安全快照，导入失败时自动回滚。
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setImportPreview(null)}>取消</Button>
              <Button
                variant="danger"
                disabled={importing}
                onClick={async () => {
                  setImporting(true)
                  try {
                    const res = await api.backup.import(importPreview.path)
                    toast('success', `已恢复：${res.restored.tasks} 个任务、${res.restored.collections} 条收藏、${res.restored.notes} 篇笔记`)
                    setImportPreview(null)
                  } catch (err) {
                    toast('error', err instanceof Error ? err.message : '恢复失败')
                  } finally {
                    setImporting(false)
                  }
                }}
              >
                替换当前数据
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function ExportBtn({
  icon,
  label,
  defaultName,
  filters,
  format
}: {
  icon: React.ReactNode
  label: string
  defaultName: string
  filters: { name: string; extensions: string[] }[]
  format: 'json' | 'csv-tasks' | 'csv-collections' | 'csv-files' | 'md-notes'
}) {
  const { toast } = useApp()
  return (
    <Button
      onClick={async () => {
        try {
          const target = await api.dialog.saveFile({ defaultName, filters })
          if (!target) return
          const res = await api.exportData.run(target, format)
          toast('success', `已导出 ${res.count} 条记录 → ${res.path}`)
        } catch (err) {
          toast('error', err instanceof Error ? err.message : '导出失败')
        }
      }}
    >
      {icon} {label}
    </Button>
  )
}

const THEME_SWATCH: Record<ThemeName, string> = {
  mint: 'linear-gradient(135deg,#40916c,#d6eee3)',
  lavender: 'linear-gradient(135deg,#7a60aa,#e7dff4)',
  cream: 'linear-gradient(135deg,#ba7a42,#f5e3cd)',
  midnight: 'linear-gradient(135deg,#1e2330,#60a5fa)',
  glass: 'linear-gradient(135deg,rgba(122,168,220,.75),rgba(176,148,220,.75))'
}
