/**
 * File Index 文件索引（MyDesk 2.0）：桌面文件管理器式紧凑排版。
 * 页面头部（数量/大小/失效状态 + 主要操作）→ 轻量工具栏（搜索/类型/分组/失效筛选/统计）→ 文件列表。
 * 手动添加/批量添加/目录扫描（授权+预览+确认）/CSV 导入/失效清理/详情抽屉全部保留。
 * 只读记录，不移动/删除用户文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  ExternalLink,
  FolderSearch,
  Copy,
  RefreshCw,
  FileWarning,
  FolderOpen,
  MoreHorizontal,
  Upload,
  Download,
  FolderTree,
  EyeOff,
  BarChart3,
  Info
} from 'lucide-react'
import type { FileIndexItem, FileIndexStats } from '@shared/types'
import { api, type FileFilterLike } from '../api/client'
import { useApp } from '../store/AppStore'
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageToolbar,
  ProgressBar,
  SectionHeading,
  Select,
  SkeletonList,
  Tag,
  Textarea
} from '../components/ui'

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function FileIndexPage() {
  const { toast, jumpTarget } = useApp()
  const [items, setItems] = useState<FileIndexItem[] | null>(null)
  const [search, setSearch] = useState('')
  const [fileType, setFileType] = useState('all')
  const [onlyInvalid, setOnlyInvalid] = useState(false)
  const [groupByDir, setGroupByDir] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; invalid: number } | null>(null)
  const [allTypes, setAllTypes] = useState<string[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<FileIndexItem | null>(null)
  const [renderLimit, setRenderLimit] = useState(60)
  const [stats, setStats] = useState<FileIndexStats | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanDir, setScanDir] = useState('')
  const [scanExts, setScanExts] = useState('pdf, docx, xlsx, pptx, zip')
  const [scanDepth, setScanDepth] = useState(2)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<Array<{ path: string; name: string; fileType: string; size: number }>>([])
  const [scanCancelled, setScanCancelled] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [detailFor, setDetailFor] = useState<FileIndexItem | null>(null)

  const load = useCallback(async () => {
    const filter: FileFilterLike = { search, fileType }
    try {
      setItems(await api.files.list(filter))
      setAllTypes(await api.files.types())
      setStats(await api.filesV3.stats())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载文件索引失败')
    }
  }, [search, fileType, toast])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  useEffect(() => {
    if (jumpTarget?.page === 'files') void load()
  }, [jumpTarget, load])

  const addByPath = async () => {
    try {
      const picked = await api.files.pick()
      if (!picked) return
      await api.files.create({ path: picked })
      toast('success', '文件已索引')
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '索引文件失败')
    }
  }

  const batchAdd = async () => {
    setMoreOpen(false)
    try {
      const picked = await api.dialog.pickFiles()
      if (!picked || picked.length === 0) return
      const res = await api.batch.filesAdd(picked)
      toast(
        'success',
        `已添加 ${res.added.length} 个文件` +
          (res.failed.length > 0 ? `，${res.failed.length} 个失败（${res.failed[0].reason}…）` : '')
      )
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '批量添加失败')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const batchCheckAll = async () => {
    if (!items || items.length === 0) return
    const ids = items.map((i) => i.id)
    // 分批检查并显示进度（每批 10 条，保持界面响应）
    const batchSize = 10
    let done = 0
    let invalid = 0
    setBatchProgress({ done: 0, total: ids.length, invalid: 0 })
    for (let i = 0; i < ids.length; i += batchSize) {
      const slice = ids.slice(i, i + batchSize)
      try {
        const res = await api.batch.filesCheck(slice)
        for (const r of res.results) {
          const item = r.item as FileIndexItem | undefined
          if (item && item.isInvalid) invalid++
        }
      } catch {
        /* 单批失败继续 */
      }
      done = Math.min(i + batchSize, ids.length)
      setBatchProgress({ done, total: ids.length, invalid })
    }
    setBatchProgress(null)
    toast('success', `批量检查完成：${ids.length} 条中 ${invalid} 条失效`)
    await load()
  }

  const exportSelected = async () => {
    if (selected.size === 0) return
    try {
      const target = await api.dialog.saveFile({
        defaultName: `MyDesk文件索引导出-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (!target) return
      const res = await api.batch.filesExport(target, [...selected])
      toast('success', `已导出 ${res.count} 条记录 → ${res.path}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '导出失败')
    }
  }

  const runScan = async () => {
    if (!scanDir.trim()) return
    setScanning(true)
    setScanResult([])
    setScanCancelled(false)
    try {
      const exts = scanExts
        .split(/[,，]/)
        .map((x) => x.trim())
        .filter(Boolean)
      const res = await api.filesV3.scan({
        directory: scanDir.trim(),
        extensions: exts,
        maxDepth: scanDepth,
        maxFiles: 2000
      })
      setScanResult(res.files)
      setScanCancelled(res.cancelled)
      toast('info', '扫描完成：' + res.files.length + ' 个文件' + (res.cancelled ? '（已取消）' : ''))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const commitScan = async () => {
    if (scanResult.length === 0) return
    try {
      const res = await api.filesV3.commit(scanResult.map((f) => f.path))
      toast('success', '已添加 ' + res.added.length + ' 条' + (res.failed.length > 0 ? '，跳过 ' + res.failed.length + ' 条（重复/失效）' : ''))
      setScanOpen(false)
      setScanResult([])
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '添加失败')
    }
  }

  const importCsv = async () => {
    setMoreOpen(false)
    try {
      const target = await api.dialog.openFile()
      if (!target) return
      const res = await api.filesV3.importCsvAt(target)
      toast('success', '导入 ' + res.imported + ' 条，跳过 ' + res.skipped + ' 条' + (res.errors.length > 0 ? '，' + res.errors.length + ' 条错误' : ''))
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '导入失败')
    }
  }

  const cleanupInvalid = async () => {
    setMoreOpen(false)
    try {
      const res = await api.filesV3.cleanupInvalid()
      if (res.invalid.length === 0) {
        toast('success', '没有失效路径，索引很干净')
        return
      }
      if (!window.confirm('发现 ' + res.invalid.length + ' 条失效路径，确认把它们从索引移除吗？（不会触碰磁盘文件）')) return
      for (const item of res.invalid) {
        try {
          await api.files.remove(item.id)
        } catch {
          /* 忽略单条失败 */
        }
      }
      toast('success', '已移除 ' + res.invalid.length + ' 条失效记录')
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '清理失败')
    }
  }

  const checkItem = async (item: FileIndexItem) => {
    try {
      const { result } = await api.files.check(item.id)
      if (result.exists) toast('success', `路径有效（${formatSize(result.size)}）`)
      else toast('error', '路径已失效——已标记为丢失')
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '检查失败')
    }
  }

  const removeItem = async (item: FileIndexItem) => {
    try {
      await api.files.remove(item.id)
      toast('success', '已从索引移除（未触碰文件本身）')
      setSelected((prev) => {
        const n = new Set(prev)
        n.delete(item.id)
        return n
      })
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '移除失败')
    }
  }

  const visible = items
  const totalSize = (visible ?? []).reduce((sum, f) => sum + (f.size ?? 0), 0)
  const invalidCount = (visible ?? []).filter((f) => f.isInvalid).length

  const grouped = (() => {
    if (!groupByDir || !visible) return null
    const map = new Map<string, FileIndexItem[]>()
    for (const f of visible) {
      const dir = f.path.slice(0, Math.max(f.path.lastIndexOf('\\'), f.path.lastIndexOf('/')) + 1) || f.path
      const list = map.get(dir) ?? []
      list.push(f)
      map.set(dir, list)
    }
    return [...map.entries()]
  })()

  const rows = ((groupByDir && grouped
    ? grouped.flatMap(([dir, list]) => list.map((f, idx) => ({ f, dir: idx === 0 ? dir : null })))
    : (visible ?? []).map((f) => ({ f, dir: null }))
  ).filter(({ f }) => !onlyInvalid || f.isInvalid))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="文件索引"
        description={
          (visible?.length ?? 0) > 0
            ? `共 ${visible!.length} 条 · 总大小 ${formatSize(totalSize)}${
                invalidCount > 0 ? ` · ${invalidCount} 条失效` : ' · 路径全部有效'
              }`
            : '记录重要文件的位置，随时查找与核验。'
        }
        actions={
          <>
            <div className="relative">
              <Button onClick={() => setMoreOpen((v) => !v)}>
                <MoreHorizontal size={15} /> 更多操作
              </Button>
              <AnimatePresence>
                {moreOpen && (
                  <>
                    {/* 点击外部关闭 */}
                    <div className="fixed inset-0 z-30" onMouseDown={() => setMoreOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      className="glass-card absolute right-0 top-11 z-40 w-44 rounded-xl border border-border p-1.5 shadow-lifted"
                    >
                      <MenuBtn icon={<Plus size={14} />} label="批量添加文件" onClick={() => { setMoreOpen(false); void batchAdd() }} />
                      <MenuBtn icon={<Upload size={14} />} label="导入 CSV" onClick={() => void importCsv()} />
                      <MenuBtn icon={<Trash2 size={14} />} label="失效清理建议" onClick={() => void cleanupInvalid()} />
                      <MenuBtn
                        icon={<RefreshCw size={14} />}
                        label="批量检查路径"
                        onClick={() => {
                          setMoreOpen(false)
                          void batchCheckAll()
                        }}
                      />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <Button
              onClick={() => {
                setScanOpen(true)
                setScanResult([])
              }}
            >
              <FolderTree size={15} /> 目录扫描
            </Button>
            <Button variant="primary" onClick={() => void addByPath()}>
              <Plus size={16} /> 索引文件
            </Button>
          </>
        }
      />

      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索名称 / 路径…" className="!py-1.5 !pl-8" />
        </div>
        <div className="flex-1" />
        <Select
          value={fileType}
          onChange={setFileType}
          options={[{ value: 'all', label: '全部类型' }, ...allTypes.map((t) => ({ value: t, label: t.toUpperCase() }))]}
          className="!py-1.5"
        />
        <IconButton title="按目录分组" active={groupByDir} onClick={() => setGroupByDir((v) => !v)}>
          <FolderTree size={15} />
        </IconButton>
        <IconButton title="仅看失效" active={onlyInvalid} onClick={() => setOnlyInvalid((v) => !v)}>
          <EyeOff size={15} />
        </IconButton>
        <IconButton title="统计" active={showStats} onClick={() => setShowStats((v) => !v)}>
          <BarChart3 size={15} />
        </IconButton>
      </PageToolbar>

      {/* 统计面板 */}
      <AnimatePresence initial={false}>
        {showStats && stats && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <Card className="p-5">
              <SectionHeading
                title="索引统计"
                extra={
                  <Button variant="ghost" size="sm" onClick={() => setShowStats(false)}>
                    收起
                  </Button>
                }
              />
              <div className="mb-3 mt-2 flex flex-wrap gap-4 text-xs text-text-2">
                <span>共 <b className="text-text">{stats.total}</b> 条</span>
                <span>总大小 <b className="text-text">{formatSize(stats.totalSize)}</b></span>
                <span>失效 <b className="text-danger">{stats.invalidCount}</b> 条</span>
                <span>最近 7 天新增 <b className="text-text">{stats.recentAdded}</b> 条</span>
                {stats.duplicatePaths.length > 0 && <span className="text-warning">⚠ 重复路径 {stats.duplicatePaths.length} 组</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {stats.byType.slice(0, 8).map((t) => (
                  <div key={t.fileType} className="flex items-center gap-2 text-xs">
                    <span className="w-14 font-mono uppercase text-text-2">{t.fileType}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: (t.count / Math.max(stats.total, 1)) * 100 + '%' }} />
                    </div>
                    <span className="w-8 text-right font-mono tabular-nums">{t.count}</span>
                    <span className="w-20 text-right text-text-3">{formatSize(t.size)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量检查进度 */}
      {batchProgress && (
        <Card className="flex items-center gap-3 px-4 py-3">
          <span className="shrink-0 text-xs text-text-2">
            正在检查路径… {batchProgress.done}/{batchProgress.total}（失效 {batchProgress.invalid}）
          </span>
          <ProgressBar
            className="flex-1"
            value={(batchProgress.done / Math.max(1, batchProgress.total)) * 100}
          />
        </Card>
      )}

      {/* 批量工具条（选中后出现） */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary-soft/50 px-4 py-2.5">
          <span className="text-sm font-medium text-text">已选 {selected.size} 项</span>
          <Button size="sm" onClick={() => setSelected(new Set(visible!.map((f) => f.id)))}>全选当前列表</Button>
          <Button size="sm" onClick={() => void exportSelected()}>导出选中</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>取消选择</Button>
        </div>
      )}

      {items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={36} />}
          title="还没有索引任何文件"
          hint="记录重要文件的位置，以后随时查找和核验。MyDesk 只读取文件元信息——绝不会移动或删除你的文件。也可以用「目录扫描」批量导入一个目录下的文件。"
          action={
            <Button variant="primary" onClick={() => void addByPath()}>
              <Plus size={16} /> 索引第一个文件
            </Button>
          }
        />
      ) : (
        <Card variant="outlined" className="overflow-hidden">
          <AnimatePresence initial={false}>
            {rows.slice(0, renderLimit).map(({ f, dir }) => (
              <div key={f.id}>
                {dir && (
                  <p className="truncate border-b border-border bg-surface-2/60 px-4 py-1.5 font-mono text-[11px] text-text-3" title={dir}>
                    📁 {dir}
                  </p>
                )}
                <FileRow
                  f={f}
                  selected={selected.has(f.id)}
                  onToggle={() => toggleSelect(f.id)}
                  onCheck={() => void checkItem(f)}
                  onEdit={() => {
                    setEditing(f)
                    setEditorOpen(true)
                  }}
                  onDetail={() => setDetailFor(f)}
                  onRemoved={() => void removeItem(f)}
                />
              </div>
            ))}
          </AnimatePresence>
        </Card>
      )}

      {items !== null && items.length > renderLimit && (
        <div className="flex justify-center py-2">
          <Button onClick={() => setRenderLimit((n) => n + 60)}>
            加载更多（还有 {items.length - renderLimit} 条）
          </Button>
        </div>
      )}

      {/* 目录扫描 */}
      <Modal open={scanOpen} onClose={() => setScanOpen(false)} title="目录扫描（可选功能）" wide>
        <p className="mb-3 text-xs leading-5 text-text-3">
          由你主动选择目录并授权扫描；只读取文件名与大小等元信息，绝不修改、移动或删除文件。结果先预览，确认后才加入索引。
        </p>
        <Field label="扫描目录">
          <div className="flex gap-2">
            <Input value={scanDir} onChange={setScanDir} placeholder="例如 C:\Users\you\Documents" mono />
            <Button
              onClick={async () => {
                const dir = await api.dialog.pickDirectory()
                if (dir) setScanDir(dir)
              }}
            >
              选择
            </Button>
          </div>
        </Field>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Field label="文件类型（逗号分隔，留空 = 全部）">
            <Input value={scanExts} onChange={setScanExts} placeholder="pdf, docx" />
          </Field>
          <Field label="扫描深度（0 = 仅该目录）">
            <Input
              type="number"
              min={0}
              max={10}
              value={String(scanDepth)}
              onChange={(v) => {
                const n = parseInt(v, 10)
                if (!Number.isNaN(n) && n >= 0 && n <= 10) setScanDepth(n)
              }}
            />
          </Field>
        </div>
        <div className="mb-3 flex gap-2">
          <Button variant="primary" disabled={!scanDir.trim() || scanning} onClick={() => void runScan()}>
            {scanning ? '扫描中…' : '开始扫描'}
          </Button>
          {scanResult.length > 0 && (
            <Button variant="primary" onClick={() => void commitScan()}>
              将 {scanResult.length} 个文件加入索引
            </Button>
          )}
          {scanCancelled && <span className="self-center text-xs text-warning">扫描已被取消</span>}
        </div>
        {scanResult.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
            {scanResult.map((f) => (
              <div key={f.path} className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 text-xs last:border-0">
                <span className="min-w-0 flex-1 truncate text-text">{f.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-text-3">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 文件详情抽屉 */}
      <Drawer open={detailFor !== null} onClose={() => setDetailFor(null)} title="文件详情">
        {detailFor && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <p className="font-medium text-text">{detailFor.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Tag variant="neutral">{detailFor.fileType.toUpperCase()}</Tag>
                <Tag variant="neutral">{formatSize(detailFor.size)}</Tag>
                {detailFor.version && <Tag>v{detailFor.version}</Tag>}
                {detailFor.isInvalid && <Tag variant="danger">已失效</Tag>}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="mb-1 text-[11px] font-medium text-text-3">完整路径（点击复制）</p>
              <button
                className="break-all text-left font-mono text-xs leading-5 text-text-2 transition-colors hover:text-text"
                onClick={async () => {
                  await api.files.copyPath(detailFor.id)
                  toast('success', '路径已复制')
                }}
                title="复制路径"
              >
                {detailFor.path}
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-text-3">索引时间</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-text-2">{detailFor.createdAt.slice(0, 10)}</dd>
              </div>
              <div>
                <dt className="text-text-3">上次检查</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-text-2">
                  {detailFor.lastCheckedAt ? detailFor.lastCheckedAt.slice(0, 10) : '从未检查'}
                </dd>
              </div>
              {detailFor.notes && (
                <div className="col-span-2">
                  <dt className="text-text-3">备注</dt>
                  <dd className="mt-0.5 leading-5 text-text-2">{detailFor.notes}</dd>
                </div>
              )}
              {detailFor.tags.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-text-3">标签</dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {detailFor.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  try {
                    await api.files.open(detailFor.id)
                  } catch (err) {
                    toast('error', err instanceof Error ? err.message : '打开失败')
                  }
                }}
              >
                <ExternalLink size={14} /> 打开文件
              </Button>
              <Button size="sm" onClick={() => void api.files.openDir(detailFor.id)}>
                <FolderSearch size={14} /> 打开所在目录
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  await api.files.copyPath(detailFor.id)
                  toast('success', '路径已复制')
                }}
              >
                <Copy size={14} /> 复制路径
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(detailFor)
                  setDetailFor(null)
                  setEditorOpen(true)
                }}
              >
                <Pencil size={14} /> 编辑
              </Button>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] leading-4 text-text-3">
              <Info size={12} className="mt-0.5 shrink-0" />
              MyDesk 只记录路径与元信息，不会移动、修改或删除磁盘上的文件。
            </p>
          </div>
        )}
      </Drawer>

      <FileEditorModal
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          setEditorOpen(false)
          await load()
        }}
      />
    </div>
  )
}

function MenuBtn({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
    >
      {icon}
      {label}
    </button>
  )
}

function FileEditorModal({
  open,
  editing,
  onClose,
  onSaved
}: {
  open: boolean
  editing: FileIndexItem | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { toast } = useApp()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [notes, setNotes] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPath(editing?.path ?? '')
    setName(editing?.name ?? '')
    setVersion(editing?.version ?? '')
    setNotes(editing?.notes ?? '')
    setTagsText(editing?.tags.join(', ') ?? '')
  }, [open, editing])

  // 手动输入路径后自动读取名称/类型/大小
  const onPathBlur = async () => {
    if (!path.trim() || editing) return
    try {
      const info = await api.files.stat(path.trim())
      if (info.exists && info.name) setName(info.name)
      if (!info.exists) toast('info', '该路径当前不存在——仍可保存，稍后可再检查')
    } catch {
      /* ignore */
    }
  }

  const submit = async () => {
    if (!path.trim()) return
    setBusy(true)
    try {
      const tags = tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      if (editing) {
        await api.files.update(editing.id, { path: path.trim(), name: name.trim() || undefined, version, notes, tags })
        toast('success', '记录已更新')
      } else {
        await api.files.create({ path: path.trim(), name: name.trim() || undefined, version, notes, tags })
        toast('success', '文件已索引')
      }
      await onSaved()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存记录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? '编辑文件记录' : '索引文件'}>
      <Field label="完整路径 *">
        <Input value={path} onChange={setPath} onBlur={() => void onPathBlur()} placeholder="C:\Users\you\Documents\report.pdf" mono />
      </Field>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="显示名称">
          <Input value={name} onChange={setName} placeholder="从路径自动填入" />
        </Field>
        <Field label="版本">
          <Input value={version} onChange={setVersion} placeholder="例如 1.2.0" />
        </Field>
      </div>
      <Field label="标签（逗号分隔）">
        <Input value={tagsText} onChange={setTagsText} placeholder="合同, 2026" />
      </Field>
      <Field label="备注">
        <Textarea value={notes} onChange={setNotes} rows={2} placeholder="这个文件是做什么的？" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={!path.trim() || busy}>
          {editing ? '保存修改' : '加入索引'}
        </Button>
      </div>
    </Modal>
  )
}

// ---------- 单条文件记录（紧凑行 + 复选框） ----------

function FileRow({
  f,
  selected,
  onToggle,
  onCheck,
  onEdit,
  onDetail,
  onRemoved
}: {
  f: FileIndexItem
  selected: boolean
  onToggle: () => void
  onCheck: () => void
  onEdit: () => void
  onDetail: () => void
  onRemoved: () => void
}) {
  const { toast } = useApp()
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`group flex items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors last:border-0 hover:bg-surface-2/70 ${
        f.isInvalid ? 'bg-danger/5' : ''
      } ${selected ? 'bg-primary-soft/40' : ''}`}
    >
      <button
        onClick={onToggle}
        title={selected ? '取消选择' : '加入选择'}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs transition-all ${
          selected ? 'border-primary bg-primary text-on-primary' : 'border-border-strong hover:border-primary'
        }`}
      >
        {selected && '✓'}
      </button>
      <div
        className={`flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase ${
          f.isInvalid ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary'
        }`}
      >
        {f.fileType ? f.fileType.slice(0, 4) : '文件'}
      </div>
      {/* 文件名是最主要信息；点击行打开详情 */}
      <button onClick={onDetail} className="min-w-0 flex-1 text-left" title="查看详情">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text group-hover:text-primary">{f.name}</span>
          {f.isInvalid && (
            <Tag variant="danger">
              <FileWarning size={10} /> 已失效
            </Tag>
          )}
          {f.version && <Tag variant="neutral">v{f.version}</Tag>}
        </div>
        <p className="truncate font-mono text-xs text-text-3">{f.path}</p>
        <p className="text-[10px] tabular-nums text-text-3">
          {formatSize(f.size)}
          {f.lastCheckedAt ? ` · 检查于 ${f.lastCheckedAt.slice(0, 10)}` : ' · 从未检查'}
          {f.notes ? ` · ${f.notes}` : ''}
        </p>
      </button>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn title="检查路径" onClick={onCheck}>
          <RefreshCw size={14} />
        </IconBtn>
        <IconBtn
          title="打开文件"
          onClick={async () => {
            try {
              await api.files.open(f.id)
            } catch (err) {
              toast('error', err instanceof Error ? err.message : '打开失败')
            }
          }}
        >
          <ExternalLink size={14} />
        </IconBtn>
        <IconBtn title="打开所在目录" onClick={() => void api.files.openDir(f.id)}>
          <FolderSearch size={14} />
        </IconBtn>
        <IconBtn
          title="复制路径"
          onClick={async () => {
            await api.files.copyPath(f.id)
            toast('success', '路径已复制')
          }}
        >
          <Copy size={14} />
        </IconBtn>
        <IconBtn title="编辑" onClick={onEdit}>
          <Pencil size={14} />
        </IconBtn>
        <IconBtn title="从索引移除" danger onClick={onRemoved}>
          <Trash2 size={14} />
        </IconBtn>
      </div>
    </motion.div>
  )
}

function IconBtn({
  children,
  onClick,
  title,
  danger = false
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition-colors ${
        danger ? 'text-text-3 hover:bg-danger/10 hover:text-danger' : 'text-text-3 hover:bg-surface-3 hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
