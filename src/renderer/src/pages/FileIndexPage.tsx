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
import {
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
  const [allTypes, setAllTypes] = useState<string[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<FileIndexItem | null>(null)

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold text-text">文件索引</h1>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索名称 / 路径…" className="!w-56 !pl-8" />
        </div>
        <Select
          value={fileType}
          onChange={setFileType}
          options={[{ value: 'all', label: '全部类型' }, ...allTypes.map((t) => ({ value: t, label: t.toUpperCase() }))]}
        />
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
          <AnimatePresence initial={false}>
            {items.map((f) => (
              <motion.div key={f.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card hover className={`group px-4 py-3 ${f.isInvalid ? 'border-danger/40' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold uppercase ${
                        f.isInvalid ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary'
                      }`}
                    >
                      {f.fileType ? f.fileType.slice(0, 4) : 'file'}
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
                      <IconBtn title="检查路径" onClick={() => void checkItem(f)}><RefreshCw size={14} /></IconBtn>
                      <IconBtn title="打开文件" onClick={async () => {
                        try { await api.files.open(f.id) } catch (err) {
                          toast('error', err instanceof Error ? err.message : '打开失败')
                          await load()
                        }
                      }}><ExternalLink size={14} /></IconBtn>
                      <IconBtn title="打开所在目录" onClick={() => void api.files.openDir(f.id)}><FolderSearch size={14} /></IconBtn>
                      <IconBtn title="复制路径" onClick={async () => {
                        await api.files.copyPath(f.id)
                        toast('success', '路径已复制')
                      }}><Copy size={14} /></IconBtn>
                      <IconBtn title="编辑" onClick={() => { setEditing(f); setEditorOpen(true) }}><Pencil size={14} /></IconBtn>
                      <IconBtn title="从索引移除" danger onClick={() => void removeItem(f)}><Trash2 size={14} /></IconBtn>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
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
