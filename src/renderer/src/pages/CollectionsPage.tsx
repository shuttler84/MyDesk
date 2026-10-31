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
  Bookmark,
  History
} from 'lucide-react'
import type {
  Collection,
  CollectionGroup,
  CollectionHistoryEntry,
  CollectionInput,
  CollectionStats,
  CollectionType,
  Priority,
  ResearchStatus
} from '@shared/types'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchTagsOpen, setBatchTagsOpen] = useState(false)
  const [batchTagsMode, setBatchTagsMode] = useState<'replace' | 'add'>('add')
  const [batchTagsText, setBatchTagsText] = useState('')
  const [busy, setBusy] = useState(false)
  const [renderLimit, setRenderLimit] = useState(60)
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])
  const [groupId, setGroupId] = useState<string | 'all' | 'none'>('all')
  const [sortBy, setSortBy] = useState('created_desc')
  const [tagMode, setTagMode] = useState<'and' | 'or'>('and')
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [dupInfo, setDupInfo] = useState<{ duplicates: Array<{ url: string; count: number }>; similar: Array<{ host: string; count: number }> } | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [historyFor, setHistoryFor] = useState<Collection | null>(null)
  const [history, setHistory] = useState<CollectionHistoryEntry[]>([])
  const [groupManageOpen, setGroupManageOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const load = useCallback(async () => {
    const filter: CollectionFilterLike & { tagMode?: string; sortBy?: string; groupId?: string | null } = {
      type,
      status,
      tags: selectedTags,
      search,
      tagMode,
      sortBy,
      groupId: groupId === 'all' ? undefined : groupId === 'none' ? null : groupId
    }
    try {
      setItems(await api.collections.list(filter))
      setAllTags(await api.collections.tags())
      setGroups(await api.groups.list())
      setStats(await api.collectionsV3.stats())
      setDupInfo(await api.collectionsV3.duplicates())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载收藏失败')
    }
  }, [type, status, selectedTags, search, tagMode, sortBy, groupId, toast])

  useEffect(() => {
    setItems(null)
    setRenderLimit(60)
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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    if (items) setSelected(new Set(items.map((c) => c.id)))
  }

  const openHistory = async (c: Collection) => {
    try {
      setHistory(await api.collectionsV3.history(c.id))
      setHistoryFor(c)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载历史失败')
    }
  }

  const batchDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`确定删除选中的 ${selected.size} 条收藏吗？此操作不可撤销。`)) return
    setBusy(true)
    try {
      const res = await api.batch.collectionsDelete([...selected])
      toast('success', `已删除 ${res.deleted} 条收藏`)
      setSelected(new Set())
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '批量删除失败')
    } finally {
      setBusy(false)
    }
  }

  const batchTags = async () => {
    if (selected.size === 0) return
    const tags = batchTagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    if (tags.length === 0) return
    setBusy(true)
    try {
      const res = await api.batch.collectionsTags([...selected], batchTagsMode, tags)
      toast('success', `已更新 ${res.updated} 条收藏的标签`)
      setBatchTagsOpen(false)
      setBatchTagsText('')
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '批量修改标签失败')
    } finally {
      setBusy(false)
    }
  }

  const exportSelected = async () => {
    if (selected.size === 0) return
    try {
      const target = await api.dialog.saveFile({
        defaultName: `MyDesk收藏导出-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (!target) return
      const res = await api.batch.collectionsExport(target, [...selected])
      toast('success', `已导出 ${res.count} 条收藏 → ${res.path}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '导出失败')
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
        <Select
          value={groupId}
          onChange={(v) => setGroupId(v as typeof groupId)}
          options={[
            { value: 'all', label: '全部分组' },
            { value: 'none', label: '未分组' },
            ...groups.map((g) => ({ value: g.id, label: '📁 ' + g.name }))
          ]}
        />
        <Select
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: 'created_desc', label: '最新创建' },
            { value: 'created_asc', label: '最早创建' },
            { value: 'updated_desc', label: '最近修改' },
            { value: 'name_asc', label: '名称 A→Z' },
            { value: 'importance', label: '重要程度' }
          ]}
        />
        <Button className="text-xs" onClick={() => setShowStats((v) => !v)}>
          统计
        </Button>
        <Button className="text-xs" onClick={() => setGroupManageOpen(true)}>
          分组管理
        </Button>
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
            <>
              <Tag active={tagMode === 'and'} onClick={() => setTagMode('and')}>
                全部包含
              </Tag>
              <Tag active={tagMode === 'or'} onClick={() => setTagMode('or')}>
                任一包含
              </Tag>
              <button className="text-xs text-text-3 underline hover:text-text" onClick={() => setSelectedTags([])}>
                清除
              </button>
            </>
          )}
        </div>
      )}

      {/* 批量操作工具条 */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 px-4 py-2.5"
        >
          <span className="text-sm font-medium text-text">已选 {selected.size} 项</span>
          <Button className="text-xs" onClick={selectAllVisible}>
            全选当前列表
          </Button>
          <Button className="text-xs" onClick={() => setBatchTagsOpen(true)}>
            批量修改标签
          </Button>
          {groups.length > 0 && (
            <Select
              className="!py-1 text-xs"
              value=""
              onChange={(v) => {
                if (!v) return
                void api.collectionsV3.setGroup([...selected], v).then((r) => {
                  toast('success', '已将 ' + r.updated + ' 条加入分组')
                  setSelected(new Set())
                  void load()
                })
              }}
              options={[{ value: '', label: '加入分组…' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            />
          )}
          <Button className="text-xs" onClick={() => void exportSelected()}>
            导出选中
          </Button>
          <Button variant="danger" className="text-xs" disabled={busy} onClick={() => void batchDelete()}>
            批量删除
          </Button>
          <Button variant="ghost" className="text-xs" onClick={() => setSelected(new Set())}>
            取消选择
          </Button>
        </motion.div>
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
            {items.slice(0, renderLimit).map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
              >
                <CollectionCard
                  c={c}
                  selected={selected.has(c.id)}
                  onToggle={() => toggleSelect(c.id)}
                  onOpen={() => void openInBrowser(c)}
                  onCopy={() => void copyLink(c)}
                  onEdit={() => {
                    setEditing(c)
                    setEditorOpen(true)
                  }}
                  onDelete={() => void removeItem(c)}
                  onHistory={() => void openHistory(c)}
                  onChanged={() => void load()}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.slice(0, renderLimit).map((c) => (
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
                <RowBtn title="修改历史" onClick={() => void openHistory(c)}><History size={14} /></RowBtn>
                  <RowBtn title="编辑" onClick={() => { setEditing(c); setEditorOpen(true) }}><Pencil size={14} /></RowBtn>
                <RowBtn title="删除" danger onClick={() => void removeItem(c)}><Trash2 size={14} /></RowBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 长列表分页加载 */}
      {items !== null && items.length > renderLimit && (
        <div className="flex justify-center py-2">
          <Button onClick={() => setRenderLimit((n) => n + 60)}>
            加载更多（还有 {items.length - renderLimit} 条）
          </Button>
        </div>
      )}

      {/* 批量修改标签 */}
      <Modal open={batchTagsOpen} onClose={() => setBatchTagsOpen(false)} title={`批量修改标签（已选 ${selected.size} 项）`}>
        <Field label="方式">
          <Select
            value={batchTagsMode}
            onChange={(v) => setBatchTagsMode(v as 'replace' | 'add')}
            options={[
              { value: 'add', label: '追加标签（保留已有）' },
              { value: 'replace', label: '替换全部标签' }
            ]}
          />
        </Field>
        <Field label="标签（逗号分隔）">
          <Input value={batchTagsText} onChange={setBatchTagsText} placeholder="react, 教程" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setBatchTagsOpen(false)}>取消</Button>
          <Button variant="primary" disabled={busy || !batchTagsText.trim()} onClick={() => void batchTags()}>
            应用到 {selected.size} 项
          </Button>
        </div>
      </Modal>

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
  selected,
  onToggle,
  onOpen,
  onCopy,
  onEdit,
  onDelete,
  onHistory,
  onChanged
}: {
  c: Collection
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onHistory: () => void
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
    <Card
      hover
      className={`group relative flex h-full flex-col overflow-hidden ${selected ? 'border-primary ring-2 ring-primary/30' : ''}`}
    >
      {/* 多选复选框 */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        title={selected ? '取消选择' : '加入选择'}
        className={`absolute right-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${
          selected ? 'border-primary bg-primary text-on-primary' : 'border-border-strong bg-surface/80 opacity-0 group-hover:opacity-100 hover:opacity-100'
        }`}
        style={{ opacity: selected ? 1 : undefined }}
      >
        {selected && '✓'}
      </button>
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
            <RowBtn title="修改历史" onClick={onHistory}><History size={14} /></RowBtn>
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
  const [renderLimit, setRenderLimit] = useState(60)
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([])
  const [groupId, setGroupId] = useState<string | 'all' | 'none'>('all')
  const [sortBy, setSortBy] = useState('created_desc')
  const [tagMode, setTagMode] = useState<'and' | 'or'>('and')
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [dupInfo, setDupInfo] = useState<{ duplicates: Array<{ url: string; count: number }>; similar: Array<{ host: string; count: number }> } | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [historyFor, setHistoryFor] = useState<Collection | null>(null)
  const [history, setHistory] = useState<CollectionHistoryEntry[]>([])
  const [groupManageOpen, setGroupManageOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

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
