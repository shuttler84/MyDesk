/**
 * 自动备份 + 备份历史卡片（设置页与数据管理页共用，阶段三）。
 */
import { MonitorDown, ShieldCheck, Trash2, FolderOpen } from 'lucide-react'
import type { BackupHistoryItem, ImportPreview } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, Input, Select, Toggle } from './ui'

export function BackupCenterCards({
  backups,
  refreshBackups,
  importPreview,
  setImportPreview,
  importing,
  setImporting
}: {
  backups: BackupHistoryItem[] | null
  refreshBackups: () => Promise<void>
  importPreview: { path: string; preview: ImportPreview } | null
  setImportPreview: (v: { path: string; preview: ImportPreview } | null) => void
  importing: boolean
  setImporting: (v: boolean) => void
}) {
  const { toast, settings, patchSettings } = useApp()

  if (!settings) return null

  return (
    <>
      {/* 手动备份 */}
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
          <ShieldCheck size={15} className="text-primary" /> 备份与恢复（.mydeskpack）
        </h3>
        <p className="mb-3 text-xs text-text-3">
          完整备份：数据库一致性快照（保险箱保持加密）+ 附件 + 完整性校验值。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              try {
                const target = await api.dialog.saveFile({
                  defaultName: `MyDesk备份-${new Date().toISOString().slice(0, 10)}.mydeskpack`,
                  filters: [{ name: 'MyDesk 备份', extensions: ['mydeskpack'] }]
                })
                if (!target) return
                const res = await api.backup.export(target)
                toast('success', `备份已创建（共归档 ${res.fileCount} 个文件）`)
                await refreshBackups()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : '备份失败')
              }
            }}
          >
            导出备份
          </Button>
          <Button
            onClick={async () => {
              try {
                const file = await api.dialog.openFile()
                if (!file) return
                const preview = await api.backup.importPreview(file)
                setImportPreview({ path: file, preview })
              } catch (err) {
                toast('error', err instanceof Error ? err.message : '无效的备份文件')
              }
            }}
          >
            恢复备份
          </Button>
        </div>
      </Card>

      {/* 自动备份 */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
          <MonitorDown size={15} className="text-accent" /> 自动备份
        </h3>
        <div className="mb-3 grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Toggle checked={settings.autoBackupEnabled} onChange={(v) => void patchSettings({ autoBackupEnabled: v })} />
            <span className="text-xs text-text-2">启用自动备份</span>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs text-text-2">备份频率</span>
            <Select
              value={settings.autoBackupFrequency}
              onChange={(v) => void patchSettings({ autoBackupFrequency: v as typeof settings.autoBackupFrequency })}
              options={[
                { value: 'daily', label: '每天' },
                { value: 'weekly', label: '每周' }
              ]}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-text-2">保留份数</span>
            <Input
              type="number"
              min={1}
              max={100}
              value={String(settings.autoBackupKeepCount)}
              onChange={(v) => {
                const n = parseInt(v, 10)
                if (!Number.isNaN(n) && n >= 1 && n <= 100) void patchSettings({ autoBackupKeepCount: n })
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              try {
                const res = await api.backupCenter.runNow()
                toast('success', `备份已创建：${res.fileName}`)
                await refreshBackups()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : '备份失败')
              }
            }}
          >
            <ShieldCheck size={14} /> 立即备份
          </Button>
          <Button onClick={() => void api.backupCenter.openFolder()}>
            <FolderOpen size={14} /> 打开备份文件夹
          </Button>
          <Button onClick={() => void refreshBackups()}>刷新历史</Button>
        </div>
        <p className="mt-2 text-xs text-text-3">
          自动备份在软件运行期间按频率静默执行，失败时通过通知中心提醒；不会阻塞正常使用。
        </p>
      </Card>

      {/* 备份历史 */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-text">备份历史</h3>
        {backups === null ? (
          <p className="text-xs text-text-3">加载中…</p>
        ) : backups.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-3">暂无自动备份记录（手动导出的备份保存在你选择的位置）</p>
        ) : (
          <div className="flex flex-col gap-2">
            {backups.map((b) => (
              <div key={b.filePath} className="rounded-xl border border-border bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text" title={b.fileName}>
                    {b.isAuto ? '🕒 ' : '📦 '}
                    {b.fileName}
                  </span>
                  <span className="text-xs text-text-3">{(b.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                  <span
                    className={`text-xs ${
                      b.integrity === 'ok' ? 'text-success' : b.integrity === 'failed' ? 'text-danger' : 'text-text-3'
                    }`}
                  >
                    {b.integrity === 'ok'
                      ? '✓ 完整'
                      : b.integrity === 'failed'
                        ? '✗ ' + (b.integrityMessage ?? '已损坏')
                        : '未检查'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-text-3">
                  {new Date(b.createdAt).toLocaleString()} · 软件版本 {b.appVersion ?? '未知'} · 结构 v{b.schemaVersion ?? '?'} · 格式 v
                  {b.formatVersion ?? '?'} · {b.includesVault ? '含加密保险箱' : '不含保险箱'}
                  {b.counts &&
                    ` · 任务 ${b.counts.tasks} / 收藏 ${b.counts.collections} / 笔记 ${b.counts.notes} / 文件 ${b.counts.files} / 附件 ${b.counts.attachments}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    className="!px-2 !py-1 text-xs"
                    onClick={async () => {
                      await refreshBackups()
                    }}
                  >
                    完整性检查
                  </Button>
                  <Button
                    className="!px-2 !py-1 text-xs"
                    onClick={async () => {
                      try {
                        const preview = await api.backup.importPreview(b.filePath)
                        setImportPreview({ path: b.filePath, preview })
                      } catch (err) {
                        toast('error', err instanceof Error ? err.message : '无效的备份文件')
                      }
                    }}
                  >
                    恢复此备份
                  </Button>
                  <Button
                    variant="danger"
                    className="!px-2 !py-1 text-xs"
                    onClick={async () => {
                      if (!window.confirm(`确定删除备份「${b.fileName}」吗？`)) return
                      try {
                        await api.backupCenter.del(b.fileName)
                        toast('success', '备份已删除')
                        await refreshBackups()
                      } catch (err) {
                        toast('error', err instanceof Error ? err.message : '删除失败')
                      }
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
