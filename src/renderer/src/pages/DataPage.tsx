/**
 * 数据管理中心（阶段三独立页面）：
 * 备份/恢复/导出/自动备份入口迁移至此，并新增数据库完整性检查、
 * Schema Migration 记录、备份格式兼容性说明与跨设备迁移指引。
 */
import { useEffect, useState } from 'react'
import { ShieldCheck, History, HardDriveDownload, Info } from 'lucide-react'
import type { AppInfo, BackupHistoryItem, DatabaseIntegrityReport } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, PageHeader, SectionHeading } from '../components/ui'
import { BackupCenterCards } from '../components/BackupCenterCards'

export function DataPage() {
  const { toast } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [integrity, setIntegrity] = useState<DatabaseIntegrityReport | null>(null)
  const [backups, setBackups] = useState<BackupHistoryItem[] | null>(null)
  const [importPreview, setImportPreview] = useState<{ path: string; preview: import('@shared/types').ImportPreview } | null>(null)
  const [importing, setImporting] = useState(false)

  const refreshBackups = async (): Promise<void> => {
    try {
      setBackups(await api.backupCenter.list())
    } catch {
      setBackups([])
    }
  }

  const runIntegrity = async (): Promise<void> => {
    try {
      setIntegrity(await api.dataCenter.integrity())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '完整性检查失败')
    }
  }

  useEffect(() => {
    void api.app.info().then(setInfo).catch(() => undefined)
    void runIntegrity()
    void refreshBackups()
  }, [])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader title="数据管理" description="备份、恢复、导出与数据库完整性 —— 你的数据永远由你掌控。" />

      {/* 数据库状态 */}
      <Card className="p-5">
        <SectionHeading
          title="数据库完整性"
          extra={<ShieldCheck size={15} className={integrity?.integrity === 'ok' ? 'text-success' : 'text-danger'} />}
        />
        {integrity === null ? (
          <p className="text-xs text-text-3">检查中…</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-text-2">
              <p>
                完整性检查：
                <b className={integrity.integrity === 'ok' ? 'text-success' : 'text-danger'}>
                  {integrity.integrity === 'ok' ? '✓ 通过' : '✗ ' + integrity.message}
                </b>
              </p>
              <p>外键引用检查：{integrity.foreignKeyViolations === 0 ? '无违规' : `${integrity.foreignKeyViolations} 项违规`}</p>
              <p>Schema Version：v{integrity.schemaVersion}</p>
              <p>数据库路径：{info?.dbPath ?? '…'}</p>
            </div>
            <div className="mt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-2">
                <History size={12} /> Schema Migration 记录
              </p>
              <div className="flex flex-col gap-1.5">
                {integrity.migrations.map((m) => (
                  <div key={m.id} className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">
                    <span className="font-mono text-text">{m.id}</span> · v{m.fromVersion} → v{m.toVersion} ·{' '}
                    {new Date(m.executedAt).toLocaleString()}
                    <span className="ml-2 text-text-3">{m.description}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <Button className="text-xs" onClick={() => void runIntegrity()}>
                重新检查
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* 备份与恢复（复用阶段二备份中心卡片组件） */}
      <BackupCenterCards
        backups={backups}
        refreshBackups={refreshBackups}
        importPreview={importPreview}
        setImportPreview={setImportPreview}
        importing={importing}
        setImporting={setImporting}
      />

      {/* 导出 */}
      <Card className="p-5">
        <SectionHeading title="导出数据" className="mb-1" />
        <p className="mb-3 text-xs text-text-3">
          普通导出绝不包含保险箱内容。保险箱数据只能通过加密的 .mydeskpack 备份离开本机。
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportBtn label="JSON（全部数据）" defaultName={`MyDesk导出-${new Date().toISOString().slice(0, 10)}.json`} format="json" />
          <ExportBtn label="CSV —— 任务" defaultName="MyDesk任务.csv" format="csv-tasks" />
          <ExportBtn label="CSV —— 收藏" defaultName="MyDesk收藏.csv" format="csv-collections" />
          <ExportBtn label="CSV —— 文件索引" defaultName="MyDesk文件索引.csv" format="csv-files" />
          <ExportBtn label="Markdown —— 笔记" defaultName="MyDesk笔记.md" format="md-notes" />
        </div>
      </Card>

      {/* 跨设备迁移指引 */}
      <Card className="p-5">
        <SectionHeading
          title="跨设备迁移"
          extra={<HardDriveDownload size={15} className="text-accent" />}
          className="mb-2"
        />
        <ol className="ml-4 list-decimal space-y-1 text-xs leading-6 text-text-2">
          <li>在旧设备：数据管理 → 导出备份，生成 .mydeskpack 文件（保险箱数据保持加密）。</li>
          <li>将备份文件复制到新设备（U 盘 / 网盘均可）。</li>
          <li>在新设备：安装 MyDesk → 数据管理 → 恢复备份，选择该文件并确认。</li>
          <li>恢复后用主密码解锁保险箱；旧设备的文件索引路径在新设备上会标记为失效（可更新路径）。</li>
        </ol>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-text-3">
          <Info size={13} className="mt-0.5 shrink-0" />
          版本不兼容（备份的结构版本高于当前软件）时会明确拒绝并提示升级；导入失败自动回滚，原数据无损。
        </p>
      </Card>

      {/* 恢复确认弹窗 */}
      {importPreview !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
          <div className="glass-card max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border p-5 shadow-modal">
            <h2 className="mb-3 text-[15px] font-semibold text-text">恢复此备份？</h2>
            <div className="mb-4 space-y-1 rounded-xl bg-surface-2 px-4 py-3 text-sm text-text-2">
              <p>创建时间：{new Date(importPreview.preview.createdAt).toLocaleString()}</p>
              <p>
                软件版本：{importPreview.preview.appVersion} · 备份格式 v{importPreview.preview.formatVersion} · 结构 v
                {importPreview.preview.schemaVersion}
              </p>
              <p>
                任务 {importPreview.preview.counts.tasks} · 收藏 {importPreview.preview.counts.collections} · 笔记{' '}
                {importPreview.preview.counts.notes} · 文件 {importPreview.preview.counts.files} · 附件{' '}
                {importPreview.preview.counts.attachments}
              </p>
              <p>保险箱数据：{importPreview.preview.counts.vaultEncrypted ? '包含（保持加密）' : '不存在'}</p>
              {importPreview.preview.warnings.map((w, i) => (
                <p key={i} className="text-warning">
                  ⚠ {w}
                </p>
              ))}
            </div>
            <p className="mb-4 text-xs text-danger">
              这是完整恢复：当前数据将被备份内容替换。恢复前会自动创建安全快照，导入失败自动回滚。
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
                    toast(
                      'success',
                      `已恢复：${res.restored.tasks} 个任务、${res.restored.collections} 条收藏、${res.restored.notes} 篇笔记`
                    )
                    setImportPreview(null)
                    await runIntegrity()
                    await refreshBackups()
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
          </div>
        </div>
      )}
    </div>
  )
}

function ExportBtn({
  label,
  defaultName,
  format
}: {
  label: string
  defaultName: string
  format: 'json' | 'csv-tasks' | 'csv-collections' | 'csv-files' | 'md-notes'
}) {
  const { toast } = useApp()
  return (
    <Button
      onClick={async () => {
        try {
          const target = await api.dialog.saveFile({ defaultName })
          if (!target) return
          const res = await api.exportData.run(target, format)
          toast('success', `已导出 ${res.count} 条记录 → ${res.path}`)
        } catch (err) {
          toast('error', err instanceof Error ? err.message : '导出失败')
        }
      }}
    >
      {label}
    </Button>
  )
}
