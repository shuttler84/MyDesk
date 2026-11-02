/**
 * Settings 设置中心（MyDesk 2.0）：左侧二级导航 + 右侧设置内容。
 * 分区：外观与主题 / 字体 / 动画与交互 / 启动 / 存储 / 备份 / 扩展 / 导出 / 关于。
 * 主题预览展示真实组件外观（迷你侧栏 + 标题 + 按钮 + 卡片）。
 * 保留原有全部设置项与存储行为。
 */
import { useEffect, useState } from 'react'
import {
  Palette,
  Sparkles,
  Rocket,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Info,
  Bell,
  Puzzle,
  Type,
  Heading1,
  Check
} from 'lucide-react'
import type { AppInfo, AppSettings, BackupHistoryItem, ImportPreview, ThemeName } from '@shared/types'
import { Toggle } from '../components/ui'
import { BackupCenterCards } from '../components/BackupCenterCards'
import { ExtensionSection } from '../components/ExtensionSection'
import { FontSection } from '../components/FontSection'
import { THEME_REGISTRY } from '@shared/themes'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, Input, Modal, Select } from '../components/ui'

type SectionId =
  | 'appearance'
  | 'font'
  | 'animation'
  | 'startup'
  | 'storage'
  | 'backup'
  | 'extension'
  | 'export'
  | 'about'

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ReactNode }> = [
  { id: 'appearance', label: '外观与主题', icon: <Palette size={15} /> },
  { id: 'font', label: '字体', icon: <Type size={15} /> },
  { id: 'animation', label: '动画与交互', icon: <Sparkles size={15} /> },
  { id: 'startup', label: '启动与安全', icon: <Rocket size={15} /> },
  { id: 'storage', label: '存储', icon: <Database size={15} /> },
  { id: 'backup', label: '备份与恢复', icon: <Bell size={15} /> },
  { id: 'extension', label: '浏览器扩展', icon: <Puzzle size={15} /> },
  { id: 'export', label: '导出数据', icon: <FileJson size={15} /> },
  { id: 'about', label: '关于', icon: <Info size={15} /> }
]

export function SettingsPage() {
  const { settings, patchSettings, toast } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [importPreview, setImportPreview] = useState<{ path: string; preview: ImportPreview } | null>(null)
  const [importing, setImporting] = useState(false)
  const [backups, setBackups] = useState<BackupHistoryItem[] | null>(null)
  const [section, setSection] = useState<SectionId>('appearance')

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
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <h1 className="font-heading text-2xl font-bold tracking-wide text-text">设置</h1>

      <div className="flex items-start gap-5">
        {/* 左侧二级导航 */}
        <nav className="sticky top-0 hidden w-44 shrink-0 flex-col gap-0.5 md:flex">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                section === s.id
                  ? 'bg-primary-soft font-semibold text-primary'
                  : 'text-text-2 hover:bg-surface-2 hover:text-text'
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </nav>

        {/* 移动端/窄窗口分区切换 */}
        <div className="flex flex-wrap gap-1.5 md:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                section === s.id ? 'bg-primary-soft font-medium text-primary' : 'bg-surface-2 text-text-2'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* 右侧内容 */}
        <div className="min-w-0 flex-1">
          {section === 'appearance' && (
            <div className="flex flex-col gap-5">
              <Card className="p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
                  <Palette size={15} className="text-primary" /> 主题
                </h3>
                <p className="mb-3 text-xs text-text-3">
                  九种主题共享同一套布局与组件，仅视觉表达不同；点击立即生效并保存。
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {THEME_REGISTRY.map((tm) => (
                    <button
                      key={tm.id}
                      onClick={() => void patchSettings({ theme: tm.id })}
                      className={`rounded-2xl border-2 p-3 text-left transition-all ${
                        settings.theme === tm.id
                          ? 'border-primary shadow-soft'
                          : 'border-border hover:border-border-strong'
                      }`}
                    >
                      {/* 真实组件外观迷你预览：侧栏局部 + 页面标题 + 按钮 + 卡片 */}
                      <ThemePreview theme={tm.id} />
                      <div className="mt-2 flex items-center gap-1.5">
                        <p className="text-xs font-medium text-text">{tm.label}</p>
                        {tm.id === 'claude' && (
                          <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] text-primary">默认</span>
                        )}
                        {settings.theme === tm.id && (
                          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-primary">
                            <Check size={11} /> 使用中
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </Card>

              {/* 标题字体策略 */}
              <Card className="p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
                  <Heading1 size={15} className="text-accent" /> 标题字体
                </h3>
                <p className="mb-3 text-xs text-text-3">
                  控制页面标题与区块标题的字体。衬线标题带来温暖的编辑式排版气质（Claude 主题默认启用）。
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {(
                    [
                      ['theme', '跟随主题', 'Claude 等主题默认使用衬线标题，其他主题使用正文字体。'],
                      ['serif', '衬线标题', '所有主题都使用思源宋体衬线标题（编辑式风格）。'],
                      ['follow', '跟随正文', '所有主题的标题都与正文字体保持一致。']
                    ] as Array<[AppSettings['headingFont'], string, string]>
                  ).map(([id, name, desc]) => {
                    const active = settings.headingFont === id
                    return (
                      <button
                        key={id}
                        onClick={() => void patchSettings({ headingFont: id })}
                        className={`rounded-2xl border-2 p-3.5 text-left transition-all ${
                          active ? 'border-primary shadow-soft' : 'border-border hover:border-border-strong'
                        }`}
                      >
                        <p
                          className="text-lg font-bold text-text"
                          style={{
                            fontFamily:
                              id === 'serif' || (id === 'theme' && settings.theme === 'claude')
                                ? "'Source Han Serif CN', Georgia, serif"
                                : undefined
                          }}
                        >
                          我的数字空间
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-text">{name}</p>
                        <p className="mt-0.5 text-[11px] leading-4 text-text-3">{desc}</p>
                      </button>
                    )
                  })}
                </div>
              </Card>
            </div>
          )}

          {section === 'font' && <FontSection settings={settings} patchSettings={patchSettings} />}

          {section === 'animation' && (
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
              <p className="mt-2 text-xs text-text-3">减少或关闭动画以提升操作效率。系统级减少动画偏好也会被尊重。</p>
            </Card>
          )}

          {section === 'startup' && (
            <Card className="p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
                <Rocket size={15} className="text-warning" /> 启动与安全
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
              <div className="flex items-center justify-between border-t border-border pt-3">
                <div>
                  <p className="text-sm font-medium text-text">开机自动启动</p>
                  <p className="text-xs text-text-3">登录 Windows 后自动在后台启动 MyDesk。</p>
                </div>
                <Toggle
                  checked={settings.launchOnStartup}
                  onChange={(v) => void patchSettings({ launchOnStartup: v })}
                />
              </div>
            </Card>
          )}

          {section === 'storage' && (
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
          )}

          {section === 'backup' && (
            <BackupCenterCards
              backups={backups}
              refreshBackups={refreshBackups}
              importPreview={importPreview}
              setImportPreview={setImportPreview}
              importing={importing}
              setImporting={setImporting}
            />
          )}

          {section === 'extension' && (
            <Card className="p-5">
              <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
                <Puzzle size={15} className="text-accent" /> 浏览器扩展（Chromium）
              </h3>
              <p className="mb-3 text-xs text-text-3">
                通过浏览器扩展一键收藏网页到 MyDesk。本地服务仅监听 127.0.0.1，需要令牌认证，不具备任何读取能力。
              </p>
              <ExtensionSection />
            </Card>
          )}

          {section === 'export' && (
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
          )}

          {section === 'about' && (
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
          )}
        </div>
      </div>

      {/* 恢复确认弹窗 */}
      <Modal open={importPreview !== null} onClose={() => setImportPreview(null)} title="恢复此备份？">
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

/** 主题迷你组件预览：用该主题的核心色绘制 侧栏局部 + 页面标题 + 按钮 + 卡片 */
function ThemePreview({ theme }: { theme: ThemeName }) {
  const p = THEME_REGISTRY.find((t) => t.id === theme)?.preview
  if (!p) return null
  return (
    <div
      className="flex h-20 w-full overflow-hidden rounded-xl border border-black/10"
      style={{ background: p.page }}
    >
      {/* 侧栏局部 */}
      <div className="flex w-9 shrink-0 flex-col gap-1 p-1.5" style={{ background: p.card }}>
        <span className="h-1.5 w-4 rounded-full" style={{ background: p.primary }} />
        <span className="h-1.5 w-5 rounded-full" style={{ background: p.text, opacity: 0.35 }} />
        <span className="h-1.5 w-5 rounded-full" style={{ background: p.text, opacity: 0.2 }} />
        <span className="h-1.5 w-5 rounded-full" style={{ background: p.text, opacity: 0.2 }} />
      </div>
      {/* 内容局部 */}
      <div className="min-w-0 flex-1 p-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold" style={{ color: p.text }}>
            页面标题
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[8px] font-medium"
            style={{ background: p.primary, color: p.page }}
          >
            新建
          </span>
        </div>
        <div
          className="mt-1.5 rounded-lg p-1.5"
          style={{
            background: p.card,
            border: theme === 'neo' ? '1.5px solid #111111' : `1px solid ${p.text}22`,
            boxShadow: theme === 'neo' ? '2px 2px 0 0 #111111' : undefined,
            borderRadius: theme === 'acid' ? 2 : theme === 'neo' ? 0 : 6
          }}
        >
          <span className="mb-1 block h-1 w-3/4 rounded-full" style={{ background: p.text, opacity: 0.55 }} />
          <span className="block h-1 w-1/2 rounded-full" style={{ background: p.text, opacity: 0.3 }} />
        </div>
      </div>
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
