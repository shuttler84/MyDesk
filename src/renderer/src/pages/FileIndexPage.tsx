/**
 * File Index 文件索引：手动添加/选择文件、路径有效性检查、打开文件/目录、
 * 复制路径、搜索、类型筛选。只读记录，不移动/删除用户文件。
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
  FolderOpen
} from 'lucide-react'
import type { FileIndexItem } from '@shared/types'
import { api, type FileFilterLike } from '../api/client'
import { useApp } from '../store/AppStore'
import { ProgressBar, 
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
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

  const load = useCallback(async () => {
    const filter: FileFilterLike = { search, fileType }
    try {
      setItems(await api.files.list(filter))
      setAllTypes(await api.files.types())
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold text-text">文件索引</h1>
        {(visible?.length ?? 0) > 0 && (
          <span className="text-xs text-text-3">
            共 {visible!.length} 条 · 总大小 {formatSize(totalSize)}
            {invalidCount > 0 && <span className="ml-2 text-danger">{invalidCount} 条失效</span>}
          </span>
        )}
        <Button className="text-xs" onClick={() => setGroupByDir((v) => !v)}>
          {groupByDir ? '按目录分组：开' : '按目录分组：关'}
        </Button>
        <Tag active={onlyInvalid} onClick={() => setOnlyInvalid((v) => !v)}>
          仅看失效
        </Tag>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索名称 / 路径…" className="!w-56 !pl-8" />
        </div>
        <Select
          value={fileType}
          onChange={setFileType}
          options={[{ value: 'all', label: '全部类型' }, ...allTypes.map((t) => ({ value: t, label: t.toUpperCase() }))]}
        />
        <Button onClick={() => void batchAdd()}>
          <Plus size={16} /> 批量添加
        </Button>
        <Button variant="primary" onClick={() => void addByPath()}>
          <Plus size={16} /> 索引文件
        </Button>
      </div>

      {items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={36} />}
          title="还没有索引任何文件"
          hint="记录重要文件的位置，以后随时查找和核验。MyDesk 只读取文件元信息——绝不会移动或删除你的文件。"
          action={
            <Button variant="primary" onClick={() => void addByPath()}>
              <Plus size={16} /> 索引第一个文件
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* 批量检查进度 */}
          {batchProgress && (
            <Card className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-text-2">
                正在检查路径… {batchProgress.done}/{batchProgress.total}（失效 {batchProgress.invalid}）
              </span>
              <ProgressBar
                className="flex-1"
                value={(batchProgress.done / Math.max(1, batchProgress.total)) * 100}
              />
            </Card>
          )}
          {/* 批量工具条 */}
          {selected.size > 0 && (
            <Card className="flex flex-wrap items-center gap-2 border-primary/40 px-4 py-2.5">
              <span className="text-sm font-medium text-text">已选 {selected.size} 项</span>
              <Button className="text-xs" onClick={() => setSelected(new Set(visible!.map((f) => f.id)))}>
                全选当前列表
              </Button>
              <Button className="text-xs" onClick={() => void exportSelected()}>
                导出选中
              </Button>
              <Button variant="ghost" className="text-xs" onClick={() => setSelected(new Set())}>
                取消选择
              </Button>
            </Card>
          )}
          <AnimatePresence initial={false}>
            {((groupByDir && grouped
              ? grouped.flatMap(([dir, list]) => list.map((f, idx) => ({ f, dir: idx === 0 ? dir : null })))
              : (visible ?? []).map((f) => ({ f, dir: null }))
            )
              .filter(({ f }) => !onlyInvalid || f.isInvalid)
              .slice(0, renderLimit)
              .map(({ f, dir }) => (
                <div key={f.id}>
                  {dir && (
                    <p className="mb-1.5 mt-2 truncate font-mono text-[11px] text-text-3" title={dir}>
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
                    onRemoved={() => {
                      setSelected((prev) => {
                        const n = new Set(prev)
                        n.delete(f.id)
                        return n
                      })
                    }}
                  />
                </div>
              )))}
          </AnimatePresence>
        </div>
      )}

      {items !== null && items.length > renderLimit && (
        <div className="flex justify-center py-2">
          <Button onClick={() => setRenderLimit((n) => n + 60)}>
            加载更多（还有 {items.length - renderLimit} 条）
          </Button>
        </div>
      )}

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

// ---------- 单条文件记录（含复选框） ----------

function FileRow({
  f,
  selected,
  onToggle,
  onCheck,
  onEdit,
  onRemoved
}: {
  f: FileIndexItem
  selected: boolean
  onToggle: () => void
  onCheck: () => void
  onEdit: () => void
  onRemoved: () => void
}) {
  const { toast, jumpTarget } = useApp()
  const load = async (): Promise<void> => {
    onRemoved()
  }
  void jumpTarget
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <Card
        hover
        className={`group flex items-center gap-3 px-4 py-3 ${f.isInvalid ? 'border-danger/40' : ''} ${
          selected ? 'border-primary ring-2 ring-primary/30' : ''
        }`}
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
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold uppercase ${
            f.isInvalid ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary'
          }`}
        >
          {f.fileType ? f.fileType.slice(0, 4) : '文件'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text">{f.name}</span>
            {f.isInvalid && (
              <Tag className="!bg-danger/10 !text-danger">
                <FileWarning size={10} className="mr-1" /> 已失效
              </Tag>
            )}
            {f.version && <Tag>v{f.version}</Tag>}
          </div>
          <p className="truncate font-mono text-xs text-text-3">{f.path}</p>
          <p className="text-[10px] text-text-3">
            {f.fileType.toUpperCase() || 'FILE'} · {formatSize(f.size)}
            {f.lastCheckedAt ? ` · 检查于 ${f.lastCheckedAt.slice(0, 10)}` : ' · 从未检查'}
            {f.notes ? ` · ${f.notes}` : ''}
          </p>
        </div>
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
                await load()
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
          <IconBtn
            title="从索引移除"
            danger
            onClick={async () => {
              try {
                await api.files.remove(f.id)
                toast('success', '已从索引移除（未触碰文件本身）')
                onRemoved()
                await (load as unknown as () => Promise<void>)()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : '移除失败')
              }
            }}
          >
            <Trash2 size={14} />
          </IconBtn>
        </div>
      </Card>
    </motion.div>
  )
}
