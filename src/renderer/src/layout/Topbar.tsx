/**
 * 顶部工具栏（阶段二增强版）：
 * - 全局搜索：实时搜索、分类筛选、关键词高亮、搜索历史（localStorage）、Ctrl+K 呼出、点击跳转
 * - 通知中心：统一接收主进程推送（任务提醒 / 备份 / 系统事件），支持清空
 * - 快速添加、主题切换、本地数据状态
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Plus, Bell, Palette, Database, CornerDownLeft, History, Trash2 } from 'lucide-react'
import type { GlobalSearchResult, NotificationItem, ThemeName } from '@shared/types'
import { useApp, THEME_LABELS } from '../store/AppStore'
import { THEME_REGISTRY, themeSwatch } from '@shared/themes'
import { api } from '../api/client'
import { Input, Tag } from '../components/ui'

const MODULE_NAMES: Record<GlobalSearchResult['module'], string> = {
  tasks: '任务',
  collections: '收藏',
  files: '文件索引',
  notes: '笔记'
}

type SearchFilter = 'all' | GlobalSearchResult['module']
const SEARCH_HISTORY_KEY = 'mydesk-search-history'

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}

function saveSearchHistory(list: string[]): void {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, 10)))
  } catch {
    /* ignore */
  }
}

/** 关键词高亮（纯文本切分，React 转义，无注入风险） */
function Highlight({ text, start, length }: { text: string; start: number; length: number }) {
  if (start < 0 || length <= 0) return <>{text}</>
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-warning/30 px-0.5 text-text">{text.slice(start, start + length)}</mark>
      {text.slice(start + length)}
    </>
  )
}

export function Topbar({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { settings, patchSettings, toast, jumpTo, jumpTarget, page } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[] | null>(null)
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [history, setHistory] = useState<string[]>(loadSearchHistory)
  const [showHistory, setShowHistory] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [showActivity, setShowActivity] = useState(false)
  const [unread, setUnread] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 通知中心：订阅主进程推送 + 拉取已有列表
  useEffect(() => {
    void api.notifications.list().then((items) => {
      setNotifications(items)
      setUnread(items.length)
    }).catch(() => undefined)
    const off = window.mydesk.onPush('push:notification', (payload) => {
      const item = payload as NotificationItem
      setNotifications((prev) => [item, ...prev].slice(0, 100))
      setUnread((u) => u + 1)
      if (item.kind === 'error') {
        toast('error', item.title)
      } else if (item.kind === 'reminder') {
        toast('info', `${item.title} —— ${item.body}`)
      }
    })
    return off
  }, [toast])

  // 全局搜索（防抖 220ms）
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        setResults(await api.search.global(q))
      } catch {
        setResults([])
      }
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  // 点击外部关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setResults(null)
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Ctrl+K 呼出搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        setShowHistory(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    if (results === null) return null
    return filter === 'all' ? results : results.filter((r) => r.module === filter)
  }, [results, filter])

  const openResult = (r: GlobalSearchResult) => {
    const q = query.trim()
    if (q) {
      const next = [q, ...history.filter((h) => h !== q)].slice(0, 10)
      setHistory(next)
      saveSearchHistory(next)
    }
    jumpTo(r.module)
    setQuery('')
    setResults(null)
    setShowHistory(false)
  }

  const applyTheme = async (t: ThemeName) => {
    await patchSettings({ theme: t })
    setShowThemeMenu(false)
    toast('success', `主题已切换：${THEME_LABELS[t]}`)
  }

  // 跳转/切页时刷新通知列表
  useEffect(() => {
    void api.notifications.list().then((items) => {
      setNotifications(items)
      setUnread(items.length)
    }).catch(() => undefined)
  }, [page, jumpTarget])

  const clearHistory = useCallback(() => {
    setHistory([])
    saveSearchHistory([])
  }, [])

  return (
    <header className="glass-card flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-5">
      {/* 全局搜索 */}
      <div ref={searchRef} className="relative w-80">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={setQuery}
          onFocus={() => setShowHistory(true)}
          placeholder="搜索任务、收藏、文件、笔记…（Ctrl+K）"
          className="pl-8"
        />
        <AnimatePresence>
          {(results !== null || (showHistory && history.length > 0)) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="glass-card absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-xl border border-border shadow-lifted"
            >
              {/* 分类筛选 */}
              {results !== null && results.length > 0 && (
                <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-border bg-surface/95 px-3 py-2 backdrop-blur">
                  {(['all', 'tasks', 'collections', 'files', 'notes'] as SearchFilter[]).map((f) => (
                    <Tag key={f} active={filter === f} onClick={() => setFilter(f)}>
                      {f === 'all' ? '全部' : MODULE_NAMES[f]}
                      {f !== 'all' && results && (
                        <span className="ml-1 opacity-70">{results.filter((r) => r.module === f).length}</span>
                      )}
                    </Tag>
                  ))}
                </div>
              )}

              {results !== null && results.length === 0 && (
                <div className="px-4 py-6 text-center">
                  <Search size={22} className="mx-auto mb-2 text-text-3" />
                  <p className="text-sm text-text-2">没有找到与「{query.trim()}」相关的内容</p>
                  <p className="mt-1 text-xs text-text-3">保险箱内容永远不会被搜索</p>
                </div>
              )}

              {results === null && history.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="flex items-center gap-1 text-xs font-semibold text-text-2">
                      <History size={12} /> 搜索历史
                    </span>
                    <button className="text-xs text-text-3 hover:text-danger" onClick={clearHistory}>
                      清空
                    </button>
                  </div>
                  {history.map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setQuery(h)
                        setShowHistory(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                    >
                      <History size={13} className="text-text-3" />
                      {h}
                    </button>
                  ))}
                </div>
              )}

              {filtered?.map((r, i) => (
                <button
                  key={`${r.module}-${r.id}-${i}`}
                  onClick={() => openResult(r)}
                  className="group flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <Tag className="!cursor-pointer">{MODULE_NAMES[r.module]}</Tag>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">
                      <Highlight text={r.title} start={r.matchStart} length={r.matchLength} />
                    </span>
                    {r.snippet && <span className="block truncate text-xs text-text-3">{r.snippet}</span>}
                  </span>
                  <CornerDownLeft size={13} className="text-text-3 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1" />

      {/* 快速添加 */}
      <button
        onClick={onQuickAdd}
        title="快速添加任务"
        className="btn-primary flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-on-primary shadow-soft"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">快速添加</span>
      </button>

      {/* 通知中心 */}
      <div className="relative">
        <button
          onClick={() => setShowActivity((v) => !v)}
          title="通知中心"
          className="relative rounded-xl p-2 text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
        >
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
        <AnimatePresence>
          {showActivity && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="glass-card absolute right-0 top-11 z-40 flex max-h-[420px] w-96 flex-col rounded-xl border border-border shadow-lifted"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold text-text-2">通知中心</span>
                <button
                  className="flex items-center gap-1 text-xs text-text-3 hover:text-danger"
                  onClick={() => {
                    setNotifications([])
                    setUnread(0)
                  }}
                >
                  <Trash2 size={12} /> 清空
                </button>
              </div>
              <div className="overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-text-3">暂无通知</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="border-b border-border/50 px-3 py-2.5 last:border-0">
                      <p className="text-xs font-medium text-text">
                        {n.kind === 'reminder' && '⏰ '}
                        {n.kind === 'error' && '❌ '}
                        {n.kind === 'success' && '✅ '}
                        {n.title}
                      </p>
                      {n.body && <p className="mt-0.5 text-[11px] leading-4 text-text-3">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-text-3">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 主题切换 */}
      <div className="relative">
        <button
          onClick={() => setShowThemeMenu((v) => !v)}
          title="切换主题"
          className="rounded-xl p-2 text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
        >
          <Palette size={18} />
        </button>
        <AnimatePresence>
          {showThemeMenu && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="glass-card absolute right-0 top-11 z-40 w-44 rounded-xl border border-border p-1.5 shadow-lifted"
            >
              {THEME_REGISTRY.map((tm) => (
                <button
                  key={tm.id}
                  onClick={() => void applyTheme(tm.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    settings?.theme === tm.id
                      ? 'bg-primary-soft font-medium text-primary'
                      : 'text-text-2 hover:bg-surface-2'
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-black/10"
                    style={{ background: themeSwatch(tm.id) }}
                  />
                  {THEME_LABELS[tm.id]}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 数据状态 */}
      <div
        title="所有数据保存在本地 SQLite"
        className="hidden items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-3 lg:flex"
      >
        <Database size={13} className="text-success" />
        本地
      </div>
    </header>
  )
}
