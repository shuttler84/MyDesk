/**
 * Collections 收藏库（MyDesk 2.0 信息架构重构）：
 * - 页面头部（标题/统计概要 + 新建收藏）→ 轻量工具栏（搜索/排序/视图/高级筛选入口）→ 可展开筛选区
 * - 启用的筛选条件以 Chip 展示，可单独清除或全部清除
 * - 卡片/列表视图、批量操作（浮动操作栏）、行内标签编辑、修改历史、统计、分组管理
 * - URL 元数据抓取、重复检测等原有能力全部保留
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
  History,
  SlidersHorizontal,
  BarChart3,
  FolderPlus,
  X,
  Check
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
  IconButton,
  Input,
  Modal,
  PageHeader,
  PageToolbar,
  SectionHeading,
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
  const [groups, setGroups] = useState<CollectionGroup[]>([])
  const [groupId, setGroupId] = useState<string | 'all' | 'none'>('all')
  const [sortBy, setSortBy] = useState('created_desc')
  const [tagMode, setTagMode] = useState<'and' | 'or'>('and')
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [dupInfo, setDupInfo] = useState<{ duplicates: Array<{ url: string; count: number }>; similar: Array<{ host: string; count: number }> } | null>(null)
  const [showStats, setShowStats] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
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

  /** 当前启用的筛选条件（Chip 展示） */
  const activeFilters: Array<{ key: string; label: string; clear: () => void }> = []
  if (type !== 'all') activeFilters.push({ key: 'type', label: `类型：${TYPE_LABELS[type]}`, clear: () => setType('all') })
  if (status !== 'all') activeFilters.push({ key: 'status', label: `状态：${STATUS_LABELS[status]}`, clear: () => setStatus('all') })
  if (groupId !== 'all')
    activeFilters.push({
      key: 'group',
      label: groupId === 'none' ? '未分组' : `分组：${groups.find((g) => g.id === groupId)?.name ?? ''}`,
      clear: () => setGroupId('all')
    })
  selectedTags.forEach((t) =>
    activeFilters.push({ key: `tag-${t}`, label: `#${t}`, clear: () => toggleTag(t) })
  )

  const clearAllFilters = () => {
    setType('all')
    setStatus('all')
    setGroupId('all')
    setSelectedTags([])
    setSearch('')
  }

  const createGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    try {
      await api.groups.create(name)
      setNewGroupName('')
      await load()
      toast('success', `分组「${name}」已创建`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '创建分组失败')
    }
  }

  const renameGroup = async (g: CollectionGroup) => {
    const name = window.prompt('新的分组名称', g.name)?.trim()
    if (!name || name === g.name) return
    try {
      await api.groups.update(g.id, { name })
      await load()
      toast('success', '分组已重命名')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '重命名失败')
    }
  }

  const deleteGroup = async (g: CollectionGroup) => {
    if (!window.confirm(`删除分组「${g.name}」？分组内的收藏不会被删除（变为未分组）。`)) return
    try {
      await api.groups.remove(g.id)
      if (groupId === g.id) setGroupId('all')
      await load()
      toast('success', '分组已删除')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '删除分组失败')
    }
  }

  const duplicateCount = (dupInfo?.duplicates.length ?? 0) + (dupInfo?.similar.length ?? 0)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="收藏"
        description={
          stats
            ? `共 ${stats.total} 条收藏${duplicateCount > 0 ? ` · 发现 ${duplicateCount} 组重复/相似项` : ''}`
            : '收集网页、GitHub 仓库、视频与文章。'
        }
        actions={
          <>
            <Button onClick={() => setGroupManageOpen(true)}>
              <FolderPlus size={15} /> 分组管理
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setEditorOpen(true)
              }}
            >
              <Plus size={16} /> 新建收藏
            </Button>
          </>
        }
      />

      {/* 第一层工具栏：仅最常用操作 */}
      <PageToolbar>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索收藏…" className="!py-1.5 !pl-8" />
        </div>

        <div className="flex-1" />

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
          className="!py-1.5"
        />
        <IconButton
          title="高级筛选"
          active={showFilters || activeFilters.length > 0}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={15} />
        </IconButton>
        <IconButton title="统计" active={showStats} onClick={() => setShowStats((v) => !v)}>
          <BarChart3 size={15} />
        </IconButton>
        <div className="flex overflow-hidden rounded-lg border border-border">
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
      </PageToolbar>

      {/* 第二层：可展开高级筛选区 */}
      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <Card variant="subtle" className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="类型">
                  <Select
                    value={type}
                    onChange={(v) => setType(v as 'all' | CollectionType)}
                    options={[{ value: 'all', label: '全部类型' }, ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))]}
                  />
                </Field>
                <Field label="研究状态">
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
                </Field>
                <Field label="分组">
                  <Select
                    value={groupId}
                    onChange={(v) => setGroupId(v as typeof groupId)}
                    options={[
                      { value: 'all', label: '全部分组' },
                      { value: 'none', label: '未分组' },
                      ...groups.map((g) => ({ value: g.id, label: g.name }))
                    ]}
                  />
                </Field>
              </div>
              {allTags.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-text-2">标签</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {allTags.map((t) => (
                      <Tag key={t} active={selectedTags.includes(t)} onClick={() => toggleTag(t)}>
                        {t}
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
              {selectedTags.length > 1 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-text-2">
                  匹配方式：
                  <Tag active={tagMode === 'and'} onClick={() => setTagMode('and')}>全部包含</Tag>
                  <Tag active={tagMode === 'or'} onClick={() => setTagMode('or')}>任一包含</Tag>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 启用中的筛选条件 Chip */}
      {(activeFilters.length > 0 || search) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {search && (
            <Chip label={`搜索：${search}`} onClear={() => setSearch('')} />
          )}
          {activeFilters.map((f) => (
            <Chip key={f.key} label={f.label} onClear={f.clear} />
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-1 text-xs text-text-3 underline underline-offset-2 transition-colors hover:text-text"
          >
            全部清除
          </button>
        </div>
      )}

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
                title="收藏统计"
                extra={
                  <Button variant="ghost" size="sm" onClick={() => setShowStats(false)}>
                    收起
                  </Button>
                }
              />
              <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-text-2">按类型</p>
                  <div className="flex flex-col gap-1">
                    {stats.byType.map((row) => (
                      <div key={row.type} className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 text-text-2">{TYPE_LABELS[row.type as CollectionType] ?? row.type}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${(row.count / Math.max(stats.total, 1)) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono tabular-nums text-text-3">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-text-2">按状态</p>
                  <div className="flex flex-col gap-1">
                    {stats.byStatus.map((row) => (
                      <div key={row.status} className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 text-text-2">{STATUS_LABELS[row.status as ResearchStatus] ?? row.status}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-accent/70" style={{ width: `${(row.count / Math.max(stats.total, 1)) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono tabular-nums text-text-3">{row.count}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mb-1.5 mt-3 text-xs font-medium text-text-2">高频标签</p>
                  <div className="flex flex-wrap gap-1">
                    {stats.topTags.slice(0, 10).map((t) => (
                      <Tag key={t.tag} variant="neutral">
                        {t.tag} <span className="opacity-60">{t.count}</span>
                      </Tag>
                    ))}
                    {stats.topTags.length === 0 && <p className="text-xs text-text-3">暂无标签</p>}
                  </div>
                </div>
              </div>
              {dupInfo && (dupInfo.duplicates.length > 0 || dupInfo.similar.length > 0) && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-1.5 text-xs font-medium text-text-2">重复 / 相似检测</p>
                  <div className="flex flex-col gap-1 text-xs text-text-2">
                    {dupInfo.duplicates.map((d) => (
                      <p key={d.url}>⚠ 完全重复（{d.count} 条）：<span className="font-mono">{d.url}</span></p>
                    ))}
                    {dupInfo.similar.map((d) => (
                      <p key={d.host}>～ 相似来源（{d.count} 条）：{d.host}</p>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {items === null ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bookmark size={36} />}
          title={activeFilters.length > 0 || search ? '没有匹配的收藏' : '还没有收藏'}
          hint={
            activeFilters.length > 0 || search
              ? '试试调整或清除上方的筛选条件。'
              : '粘贴 URL，MyDesk 会自动尝试抓取网页标题、描述与预览图。'
          }
          action={
            activeFilters.length > 0 || search ? (
              <Button onClick={clearAllFilters}>清除筛选条件</Button>
            ) : (
              <Button variant="primary" onClick={() => { setEditing(null); setEditorOpen(true) }}>
                <Plus size={16} /> 新建收藏
              </Button>
            )
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
        <Card variant="outlined" className="overflow-hidden">
          {items.slice(0, renderLimit).map((c) => (
            <div
              key={c.id}
              className="group flex items-center gap-3 border-b border-border/60 px-4 py-2.5 transition-colors last:border-0 hover:bg-surface-2/70"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-2">
                <TypeIcon type={c.type} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{c.name}</p>
                <p className="truncate font-mono text-xs text-text-3">{c.url}</p>
              </div>
              <Tag variant="neutral">{TYPE_LABELS[c.type]}</Tag>
              <Tag
                variant={
                  c.researchStatus === 'done' ? 'success' : c.researchStatus === 'researching' ? 'warning' : 'neutral'
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
            </div>
          ))}
        </Card>
      )}

      {/* 长列表分页加载 */}
      {items !== null && items.length > renderLimit && (
        <div className="flex justify-center py-2">
          <Button onClick={() => setRenderLimit((n) => n + 60)}>
            加载更多（还有 {items.length - renderLimit} 条）
          </Button>
        </div>
      )}

      {/* 批量操作浮动栏（选中后才出现，不占页面空间） */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2"
          >
            <div className="glass-card flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 px-4 py-2.5 shadow-lifted">
              <span className="text-sm font-medium text-text">已选 {selected.size} 项</span>
              <Button size="sm" onClick={selectAllVisible}>全选当前列表</Button>
              <Button size="sm" onClick={() => setBatchTagsOpen(true)}>批量修改标签</Button>
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
              <Button size="sm" onClick={() => void exportSelected()}>导出选中</Button>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => void batchDelete()}>批量删除</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>取消选择</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* 修改历史 */}
      <Modal open={historyFor !== null} onClose={() => setHistoryFor(null)} title={`修改历史 — ${historyFor?.name ?? ''}`} wide>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-3">这条收藏还没有修改记录。</p>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((h) => (
              <div key={h.id} className="rounded-xl border border-border bg-surface-2 px-3.5 py-3">
                <p className="mb-1.5 font-mono text-xs text-text-3">{new Date(h.changedAt).toLocaleString()} 修改前：</p>
                <p className="text-sm text-text">{h.snapshot.name}</p>
                <p className="truncate font-mono text-xs text-text-3">{h.snapshot.url}</p>
                {h.snapshot.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {h.snapshot.tags.map((t) => (
                      <Tag key={t} variant="neutral">{t}</Tag>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 分组管理 */}
      <Modal open={groupManageOpen} onClose={() => setGroupManageOpen(false)} title="分组管理">
        <div className="mb-3 flex gap-2">
          <Input
            value={newGroupName}
            onChange={setNewGroupName}
            placeholder="新分组名称…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createGroup()
            }}
          />
          <Button variant="primary" onClick={() => void createGroup()}>创建</Button>
        </div>
        {groups.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-3">
            还没有分组。创建分组后，可以在卡片多选中把收藏批量加入分组。
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                <span className="flex-1 truncate text-sm text-text">{g.name}</span>
                <RowBtn title="重命名" onClick={() => void renameGroup(g)}><Pencil size={14} /></RowBtn>
                <RowBtn title="删除分组" danger onClick={() => void deleteGroup(g)}><Trash2 size={14} /></RowBtn>
              </div>
            ))}
          </div>
        )}
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

/** 筛选条件 Chip（可单独清除） */
function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-primary-soft py-0.5 pl-2 pr-1 text-xs text-primary">
      {label}
      <button onClick={onClear} className="rounded p-0.5 transition-colors hover:bg-primary/20" title="清除该条件">
        <X size={11} />
      </button>
    </span>
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
  const [tagEditing, setTagEditing] = useState(false)
  const [tagText, setTagText] = useState('')

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

  // 行内标签编辑：回车保存
  const saveTags = async () => {
    setTagEditing(false)
    const tags = tagText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
    if (JSON.stringify(tags) === JSON.stringify(c.tags)) return
    try {
      await api.collections.update(c.id, { tags })
      toast('success', '标签已更新')
      onChanged()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '更新标签失败')
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
        {selected && <Check size={13} />}
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
            <p className="truncate font-mono text-xs text-text-3">{c.url}</p>
          </button>
        </div>

        {c.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-2">{c.description}</p>}
        {c.note && <p className="mt-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-text-2">📝 {c.note}</p>}

        {/* 标签行（含行内编辑） */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Tag variant="neutral">{TYPE_LABELS[c.type]}</Tag>
          {tagEditing ? (
            <input
              autoFocus
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              onBlur={() => void saveTags()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveTags()
                if (e.key === 'Escape') setTagEditing(false)
              }}
              placeholder="逗号分隔标签"
              className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:border-primary"
            />
          ) : (
            <>
              {c.tags.map((t) => (
                <Tag key={t}>{t}</Tag>
              ))}
              <button
                title="编辑标签"
                onClick={() => {
                  setTagText(c.tags.join(', '))
                  setTagEditing(true)
                }}
                className="rounded p-1 text-text-3 opacity-0 transition-opacity hover:bg-surface-3 hover:text-text group-hover:opacity-100"
              >
                <Pencil size={11} />
              </button>
            </>
          )}
          <Tag
            variant={
              c.researchStatus === 'done' ? 'success' : c.researchStatus === 'researching' ? 'warning' : 'neutral'
            }
            onClick={() => void cycleStatus()}
            active={false}
          >
            {STATUS_LABELS[c.researchStatus]}
          </Tag>
          {c.importance === 'high' && <Tag variant="danger">重要</Tag>}
        </div>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-mono text-[10px] tabular-nums text-text-3">{c.createdAt.slice(0, 10)}</span>
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
          mono
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
