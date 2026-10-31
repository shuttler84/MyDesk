/**
 * 顶部工具栏：全局搜索、快速添加任务、通知（最近活动）、主题切换、数据状态。
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search,
  Plus,
  Bell,
  Palette,
  Database,
  CornerDownLeft
} from 'lucide-react'
import type { GlobalSearchResult, ThemeName } from '@shared/types'
import { useApp, THEME_LABELS } from '../store/AppStore'
import { api } from '../api/client'
import { Input, Tag } from '../components/ui'

const MODULE_NAMES: Record<GlobalSearchResult['module'], string> = {
  tasks: '任务',
  collections: '收藏',
  files: '文件索引',
  notes: '笔记'
}

export function Topbar({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { settings, patchSettings, toast, jumpTo, jumpTarget, page } = useApp()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[] | null>(null)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [activityCount, setActivityCount] = useState(0)
  const [showActivity, setShowActivity] = useState(false)
  const [activities, setActivities] = useState<Array<{ id: number; title: string; createdAt: string; type: string }>>([])
  const searchRef = useRef<HTMLDivElement>(null)

  // 全局搜索（防抖）
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
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  // 点击外部关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setResults(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 通知徽标：最近活动数（进入页面时刷新）
  useEffect(() => {
    void api.timeline.stats().then((s) => {
      setActivityCount(Math.min(s.activities.length, 99))
      setActivities(s.activities.slice(0, 8).map((a) => ({ id: a.id, title: a.title, createdAt: a.createdAt, type: a.type })))
    }).catch(() => undefined)
  }, [page, jumpTarget])

  const openResult = (r: GlobalSearchResult) => {
    jumpTo(r.module)
    setQuery('')
    setResults(null)
  }

  const applyTheme = async (t: ThemeName) => {
    await patchSettings({ theme: t })
    setShowThemeMenu(false)
    toast('success', `主题已切换：${THEME_LABELS[t]}`)
  }

  return (
    <header className="glass-card flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-5">
      {/* 全局搜索 */}
      <div ref={searchRef} className="relative w-80">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
        <Input
          value={query}
          onChange={setQuery}
          placeholder="搜索任务、收藏、文件、笔记…"
          className="pl-8"
        />
        <AnimatePresence>
          {results !== null && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="glass-card absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-xl border border-border shadow-lifted"
            >
              {results.length === 0 ? (
                <p className="px-4 py-3 text-xs text-text-3">无结果。保险箱内容永远不会被搜索。</p>
              ) : (
                results.map((r, i) => (
                  <button
                    key={`${r.module}-${r.id}-${i}`}
                    onClick={() => openResult(r)}
                    className="group flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <Tag className="!cursor-pointer">{MODULE_NAMES[r.module]}</Tag>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">{r.title}</span>
                      {r.snippet && <span className="block truncate text-xs text-text-3">{r.snippet}</span>}
                    </span>
                    <CornerDownLeft size={13} className="text-text-3 opacity-0 group-hover:opacity-100" />
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex-1" />

      {/* 快速添加 */}
      <button
        onClick={onQuickAdd}
        title="快速添加任务"
        className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-on-primary shadow-soft transition-all hover:brightness-110 active:scale-95"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">快速添加</span>
      </button>

      {/* 通知 */}
      <div className="relative">
        <button
          onClick={() => setShowActivity((v) => !v)}
          title="最近活动"
          className="relative rounded-xl p-2 text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
        >
          <Bell size={18} />
          {activityCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {activityCount > 99 ? '99+' : activityCount}
            </span>
          )}
        </button>
        <AnimatePresence>
          {showActivity && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="glass-card absolute right-0 top-11 z-40 w-80 rounded-xl border border-border p-2 shadow-lifted"
            >
              <p className="px-2 py-1.5 text-xs font-semibold text-text-2">最近活动</p>
              {activities.length === 0 ? (
                <p className="px-2 py-2 text-xs text-text-3">暂无活动</p>
              ) : (
                activities.map((a) => (
                  <div key={a.id} className="rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2">
                    <p className="truncate text-xs text-text">{a.title || a.type}</p>
                    <p className="text-[10px] text-text-3">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                ))
              )}
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
              className="glass-card absolute right-0 top-11 z-40 w-56 rounded-xl border border-border p-1.5 shadow-lifted"
            >
              {(Object.keys(THEME_LABELS) as ThemeName[]).map((t) => (
                <button
                  key={t}
                  onClick={() => void applyTheme(t)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    settings?.theme === t
                      ? 'bg-primary-soft font-medium text-primary'
                      : 'text-text-2 hover:bg-surface-2'
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-black/10"
                    style={{ background: THEME_SWATCH[t] }}
                  />
                  {THEME_LABELS[t]}
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

const THEME_SWATCH: Record<ThemeName, string> = {
  mint: 'linear-gradient(135deg,#40916c,#d6eee3)',
  lavender: 'linear-gradient(135deg,#7a60aa,#e7dff4)',
  cream: 'linear-gradient(135deg,#ba7a42,#f5e3cd)',
  midnight: 'linear-gradient(135deg,#1e2330,#60a5fa)',
  glass: 'linear-gradient(135deg,rgba(122,168,220,.75),rgba(176,148,220,.75))'
}
