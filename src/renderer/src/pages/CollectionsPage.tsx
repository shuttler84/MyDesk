/**
 * Collections 灵感收藏库：新增/编辑/删除、URL 元数据抓取（标题/描述/图标/预览图）、
 * 重复检测、卡片/列表视图、分类筛选、多标签筛选、搜索、复制链接、默认浏览器打开。
 */
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus,
  Search,
  ExternalLink,
  Copy,
  Trash2,
  Pencil,
  LayoutGrid,
  List,
  Globe,
  Github,
  Youtube,
  Tv,
  MessageSquare,
  FileText,
  Link2,
  Bookmark
} from 'lucide-react'
import type { Collection, CollectionInput, CollectionType, Priority, ResearchStatus } from '@shared/types'
import { api, type CollectionFilterLike } from '../api/client'
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

const TYPE_LABELS: Record<CollectionType, string> = {
  website: '网站',
  github: 'GitHub',
  bilibili: 'Bilibili',
  youtube: 'YouTube',
  forum: '论坛',
  article: '文章',
  custom: '自定义'
}

const STATUS_LABELS: Record<ResearchStatus, string> = {
  unresearched: '未研究',
  researching: '研究中',
  done: '已完成'
}

function guessType(url: string): CollectionType {
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\./, '')
    if (h === 'github.com' || h.endsWith('.github.com')) return 'github'
    if (h === 'bilibili.com' || h.endsWith('.bilibili.com')) return 'bilibili'
    if (h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be') return 'youtube'
    return 'website'
  } catch {
    return 'custom'
  }
}

export function CollectionsPage() {
  const { toast, jumpTarget } = useApp()
  const [items, setItems] = useState<Collection[] | null>(null)
  const [type, setType] = useState<'all' | CollectionType>('all')
  const [status, setStatus] = useState<'all' | ResearchStatus>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [gridView, setGridView] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)

  const load = useCallback(async () => {
    const filter: CollectionFilterLike = { type, status, tags: selectedTags, search }
    try {
      setItems(await api.collections.list(filter))
      setAllTags(await api.collections.tags())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载收藏失败')
    }
  }, [type, status, selectedTags, search, toast])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  useEffect(() => {
    if (jumpTarget?.page === 'collections') void load()
  }, [jumpTarget, load])

  const removeItem = async (c: Collection) => {
    try {
      await api.collections.remove(c.id)
      toast('success', '收藏已删除')
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '删除失败')
    }
  }

  const copyLink = async (c: Collection) => {
    try {
      await window.mydesk.invoke('clipboard:write', { text: c.url })
      toast('success', '链接已复制')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '复制失败')
    }
  }

  const openInBrowser = async (c: Collection) => {
    try {
      await api.collections.openExternal(c.url)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '打开链接失败')
    }
  }

  const toggleTag = (t: string) => {
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold text-text">收藏</h1>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索…" className="!w-56 !pl-8" />
        </div>
        <Select
          value={type}
          onChange={(v) => setType(v as 'all' | CollectionType)}
          options={[{ value: 'all', label: '全部类型' }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <Select
          value={status}
          onChange={(v) => setStatus(v as 'all' | ResearchStatus)}
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'unresearched', label: '未研究' },
            { value: 'researching', label: '研究中' },
            { value: 'done', label: '已完成' }
          ]}
        />
        <div className="flex overflow-hidden rounded-xl border border-border">
          <button
            onClick={() => setGridView(true)}
            className={`p-2 ${gridView ? 'bg-primary-soft text-primary' : 'text-text-3 hover:bg-surface-3'}`}
            title="卡片视图"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setGridView(false)}
            className={`p-2 ${!gridView ? 'bg-primary-soft text-primary' : 'text-text-3 hover:bg-surface-3'}`}
            title="列表视图"
          >
            <List size={15} />
          </button>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          <Plus size={16} /> 新建收藏
        </Button>
      </div>

      {/* 多标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-3">标签：</span>
          {allTags.map((t) => (
            <Tag key={t} active={selectedTags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </Tag>
          ))}
          {selectedTags.length > 0 && (
            <button className="text-xs text-text-3 underline hover:text-text" onClick={() => setSelectedTags([])}>
              清除
            </button>
          )}
        </div>
      )}

      {items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={36} />}
          title="还没有收藏"
          hint="粘贴 URL，MyDesk 会自动尝试抓取网页标题、描述与预览图。"
          action={
            <Button variant="primary" onClick={() => { setEditing(null); setEditorOpen(true) }}>
              <Plus size={16} /> 新建收藏
            </Button>
          }
        />
      ) : gridView ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {items.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <CollectionCard
                  c={c}
                  onOpen={() => void openInBrowser(c)}
                  onCopy={() => void copyLink(c)}
                  onEdit={() => {
                    setEditing(c)
                    setEditorOpen(true)
                  }}
                  onDelete={() => void removeItem(c)}
                  onChanged={() => void load()}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((c) => (
            <Card key={c.id} hover className="group flex items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-2">
                <TypeIcon type={c.type} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{c.name}</p>
                <p className="truncate text-xs text-text-3">{c.url}</p>
              </div>
              <Tag>{TYPE_LABELS[c.type]}</Tag>
              <Tag
                className={
                  c.researchStatus === 'done'
                    ? '!bg-success/10 !text-success'
                    : c.researchStatus === 'researching'
                      ? '!bg-warning/10 !text-warning'
                      : ''
                }
              >
                {STATUS_LABELS[c.researchStatus]}
              </Tag>
              <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <RowBtn title="打开" onClick={() => void openInBrowser(c)}><ExternalLink size={14} /></RowBtn>
                <RowBtn title="复制链接" onClick={() => void copyLink(c)}><Copy size={14} /></RowBtn>
                <RowBtn title="编辑" onClick={() => { setEditing(c); setEditorOpen(true) }}><Pencil size={14} /></RowBtn>
                <RowBtn title="删除" danger onClick={() => void removeItem(c)}><Trash2 size={14} /></RowBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CollectionEditorModal
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

function TypeIcon({ type }: { type: CollectionType }) {
  const cls = 'h-4 w-4'
  switch (type) {
    case 'github': return <Github className={cls} />
    case 'youtube': return <Youtube className={cls} />
    case 'bilibili': return <Tv className={cls} />
    case 'forum': return <MessageSquare className={cls} />
    case 'article': return <FileText className={cls} />
    case 'custom': return <Link2 className={cls} />
    default: return <Globe className={cls} />
  }
}

function RowBtn({
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

function CollectionCard({
  c,
  onOpen,
  onCopy,
  onEdit,
  onDelete,
  onChanged
}: {
  c: Collection
  onOpen: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onChanged: () => void
}) {
  const { toast } = useApp()

  const cycleStatus = async () => {
    const order: ResearchStatus[] = ['unresearched', 'researching', 'done']
    const next = order[(order.indexOf(c.researchStatus) + 1) % order.length]
    try {
      await api.collections.update(c.id, { researchStatus: next })
      onChanged()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '更新状态失败')
    }
  }

  return (
    <Card hover className="flex h-full flex-col overflow-hidden">
      {/* 预览图（og:image，抓取失败时不显示） */}
      {c.previewImage && (
        <button onClick={onOpen} className="block h-32 w-full overflow-hidden bg-surface-2">
          <img
            src={c.previewImage}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        </button>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3 text-text-2">
            {c.favicon ? (
              <img
                src={c.favicon}
                alt=""
                className="h-4 w-4"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <TypeIcon type={c.type} />
            )}
          </div>
          <button onClick={onOpen} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-text transition-colors group-hover:text-primary">
              {c.name}
            </p>
            <p className="truncate text-xs text-text-3">{c.url}</p>
          </button>
        </div>

        {c.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-2">{c.description}</p>}
        {c.note && <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-text-2">📝 {c.note}</p>}

        <div className="mt-2 flex flex-wrap gap-1">
          <Tag className="!cursor-pointer">{TYPE_LABELS[c.type]}</Tag>
          {c.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          <Tag
            className={`!cursor-pointer ${
              c.researchStatus === 'done'
                ? '!bg-success/10 !text-success'
                : c.researchStatus === 'researching'
                  ? '!bg-warning/10 !text-warning'
                  : ''
            }`}
            onClick={() => void cycleStatus()}
            active={false}
          >
            {STATUS_LABELS[c.researchStatus]}
          </Tag>
          {c.importance === 'high' && <Tag className="!bg-danger/10 !text-danger">重要</Tag>}
        </div>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-[10px] text-text-3">{c.createdAt.slice(0, 10)}</span>
          <div className="flex gap-0.5">
            <RowBtn title="在浏览器打开" onClick={onOpen}><ExternalLink size={14} /></RowBtn>
            <RowBtn title="复制链接" onClick={onCopy}><Copy size={14} /></RowBtn>
            <RowBtn title="编辑" onClick={onEdit}><Pencil size={14} /></RowBtn>
            <RowBtn title="删除" danger onClick={onDelete}><Trash2 size={14} /></RowBtn>
          </div>
        </div>
      </div>
    </Card>
  )
}

function CollectionEditorModal({
  open,
  editing,
  onClose,
  onSaved
}: {
  open: boolean
  editing: Collection | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { toast } = useApp()
  const [form, setForm] = useState<CollectionInput>({ name: '', url: '' })
  const [tagsText, setTagsText] = useState('')
  const [favicon, setFavicon] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [duplicate, setDuplicate] = useState<Collection | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        url: editing.url,
        type: editing.type,
        description: editing.description,
        note: editing.note,
        tags: editing.tags,
        importance: editing.importance,
        researchStatus: editing.researchStatus
      })
      setTagsText(editing.tags.join(', '))
      setFavicon(editing.favicon)
      setPreviewImage(editing.previewImage)
      setDuplicate(null)
    } else {
      setForm({ name: '', url: '', type: 'website', description: '', note: '', tags: [], importance: 'medium', researchStatus: 'unresearched' })
      setTagsText('')
      setFavicon(null)
      setPreviewImage(null)
      setDuplicate(null)
    }
  }, [open, editing])

  // 粘贴 URL 后自动抓取元数据 + 重复检测
  const onUrlBlur = async () => {
    const url = form.url.trim()
    if (!url || editing) return
    try {
      new URL(url)
    } catch {
      return
    }
    // 类型猜测
    setForm((f) => ({ ...f, type: guessType(url) }))
    // 重复检测
    try {
      const dup = await api.collections.checkDuplicate(url)
      if (dup.duplicate && dup.collection) setDuplicate(dup.collection)
    } catch {
      /* ignore */
    }
    // 元数据抓取
    setFetching(true)
    try {
      const meta = await api.collections.fetchMeta(url)
      if (meta.title || meta.description) {
        setForm((f) => ({
          ...f,
          name: f.name || meta.title || '',
          description: f.description || meta.description || ''
        }))
        setFavicon(meta.favicon)
        setPreviewImage(meta.previewImage)
        toast('info', '已抓取网页信息，请检查并按需修改')
      } else {
        toast('info', `无法抓取网页信息（${meta.error ?? '未知'}），请手动填写。`)
      }
    } catch (err) {
      toast('info', `抓取失败（${err instanceof Error ? err.message : '未知错误'}），请手动填写。`)
    } finally {
      setFetching(false)
    }
  }

  const submit = async () => {
    if (!form.name.trim() || !form.url.trim()) return
    setBusy(true)
    try {
      const tags = tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      const payload = { ...form, tags, favicon, previewImage }
      if (editing) {
        await api.collections.update(editing.id, payload as Record<string, unknown>)
        toast('success', '收藏已更新')
      } else {
        await api.collections.create(payload)
        toast('success', '收藏已保存')
      }
      await onSaved()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存收藏失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? '编辑收藏' : '新建收藏'} wide>
      {duplicate && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-text">
          ⚠️ 该 URL 已存在于收藏「{duplicate.name}」（{duplicate.createdAt.slice(0, 10)}）。你仍然可以再次保存。
        </div>
      )}
      <Field label="URL *">
        <Input
          value={form.url}
          onChange={(v) => setForm((f) => ({ ...f, url: v }))}
          onBlur={() => void onUrlBlur()}
          placeholder="https://github.com/…"
        />
      </Field>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="名称 *">
          <Input
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="网页标题"
          />
        </Field>
        <Field label="类型">
          <Select
            value={form.type ?? 'website'}
            onChange={(v) => setForm((f) => ({ ...f, type: v as CollectionType }))}
            options={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </Field>
      </div>
      <Field label="描述">
        <Textarea
          value={form.description ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, description: v }))}
          placeholder="这个网页是关于什么的？"
          rows={2}
        />
      </Field>
      <Field label="个人备注">
        <Textarea
          value={form.note ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, note: v }))}
          placeholder="为什么收藏它？"
          rows={2}
        />
      </Field>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Field label="标签（逗号分隔）">
          <Input value={tagsText} onChange={setTagsText} placeholder="react, 教程" />
        </Field>
        <Field label="重要程度">
          <Select
            value={form.importance ?? 'medium'}
            onChange={(v) => setForm((f) => ({ ...f, importance: v as Priority }))}
            options={[
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' }
            ]}
          />
        </Field>
        <Field label="研究状态">
          <Select
            value={form.researchStatus ?? 'unresearched'}
            onChange={(v) => setForm((f) => ({ ...f, researchStatus: v as ResearchStatus }))}
            options={[
              { value: 'unresearched', label: '未研究' },
              { value: 'researching', label: '研究中' },
              { value: 'done', label: '已完成' }
            ]}
          />
        </Field>
      </div>
      {fetching && <p className="mb-2 text-xs text-text-3">正在抓取网页信息…</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={!form.name.trim() || !form.url.trim() || busy}>
          {editing ? '保存修改' : '保存收藏'}
        </Button>
      </div>
    </Modal>
  )
}
