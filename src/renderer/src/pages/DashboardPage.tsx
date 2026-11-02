/**
 * Dashboard 首页（MyDesk 2.0）：阅读感的个人工作空间。
 * 顶部问候（衬线标题）+ 主区（今日任务 / 最近活动）+ 辅助区（任务概览 / 快捷操作 / 最近访问）。
 * 全部数据来自真实数据库，无数据时展示空状态与引导。
 */
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckSquare,
  Bookmark,
  FolderOpen,
  StickyNote,
  Star,
  Plus,
  RefreshCw,
  CalendarDays,
  ChevronRight,
  History,
  ShieldCheck
} from 'lucide-react'
import type { DashboardStats, Task, Collection, FileIndexItem, Note, PageId } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, SectionHeading, PriorityDot, ProgressBar, Skeleton } from '../components/ui'

const RECENT_PAGE_NAMES: Partial<Record<PageId, string>> = {
  dashboard: '首页',
  tasks: '任务',
  collections: '收藏',
  vault: '保险箱',
  files: '文件索引',
  notes: '笔记',
  timeline: '时间轴',
  data: '数据管理'
}

export function DashboardPage() {
  const { toast, jumpTo, recentPages, setPage } = useApp()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [clock, setClock] = useState(new Date())

  const refresh = useCallback(async () => {
    try {
      setStats(await api.dashboard.stats())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载首页数据失败')
    }
  }, [toast])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(timer)
  }, [refresh])

  if (!stats) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const progress = stats.tasksTotal > 0 ? (stats.tasksDone / stats.tasksTotal) * 100 : 0
  const hour = clock.getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
  const recents = recentPages.filter((p) => p !== 'dashboard').slice(0, 3)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      {/* 问候区（不套卡片，内容优先） */}
      <header>
        <p className="text-xs font-medium tracking-wider text-text-3">
          {stats.weekday} · 个人工作空间
          <span className="ml-2 font-mono tabular-nums">{clock.toLocaleTimeString()}</span>
        </p>
        <h1 className="font-heading mt-1.5 text-3xl font-bold tracking-wide text-text">
          {greeting}，欢迎回来。
        </h1>
        <p className="mt-1.5 text-sm text-text-2">让今天的事情保持井然有序。</p>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        {/* 主区 */}
        <div className="flex flex-col gap-5 xl:col-span-2">
          {/* 今日任务 */}
          <Card className="p-5">
            <SectionHeading
              title="今日任务"
              extra={
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                    {stats.tasksDone}/{stats.tasksTotal}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => jumpTo('tasks')}>
                    全部任务 <ChevronRight size={13} />
                  </Button>
                </div>
              }
            />
            <div className="mt-3">
              <ProgressBar value={progress} />
              <p className="mt-1.5 text-right text-xs text-text-3">{Math.round(progress)}% 已完成</p>
            </div>

            <p className="mb-2 mt-4 flex items-center gap-1.5 text-xs font-medium text-text-2">
              <Star size={13} className="text-warning" /> 重要事项
            </p>
            {stats.importantTasks.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-3 py-3 text-xs leading-5 text-text-3">
                暂无重要的未完成任务。将任务标记为重要后会置顶显示在这里。
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {stats.importantTasks.slice(0, 5).map((t: Task) => (
                  <button
                    key={t.id}
                    onClick={() => jumpTo('tasks')}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <PriorityDot priority={t.priority} />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{t.title}</span>
                    {t.dueDate && (
                      <span
                        className={`shrink-0 font-mono text-xs tabular-nums ${
                          t.dueDate < stats.date ? 'text-danger' : 'text-text-3'
                        }`}
                      >
                        {t.dueDate}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* 最近活动 */}
          <Card className="p-5">
            <SectionHeading title="最近活动" />
            {stats.recentCollections.length === 0 &&
            stats.recentFiles.length === 0 &&
            stats.recentNotes.length === 0 ? (
              <p className="mt-3 rounded-xl bg-surface-2 px-3 py-4 text-center text-xs leading-5 text-text-3">
                这里还没有活动记录 —— 添加收藏、索引文件或写下第一篇笔记后，最近的内容会显示在这里。
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-0.5">
                {stats.recentCollections.slice(0, 3).map((c: Collection) => (
                  <RecentRow key={`c-${c.id}`} icon={<Bookmark size={14} />} tag="收藏" onClick={() => jumpTo('collections')}>
                    {c.name}
                  </RecentRow>
                ))}
                {stats.recentFiles.slice(0, 3).map((f: FileIndexItem) => (
                  <RecentRow key={`f-${f.id}`} icon={<FolderOpen size={14} />} tag="文件" onClick={() => jumpTo('files')} dim={f.isInvalid}>
                    {f.name}
                  </RecentRow>
                ))}
                {stats.recentNotes.slice(0, 3).map((n: Note) => (
                  <RecentRow key={`n-${n.id}`} icon={<StickyNote size={14} />} tag="笔记" onClick={() => jumpTo('notes')}>
                    {n.title || '（无标题）'}
                  </RecentRow>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* 辅助区 */}
        <div className="flex flex-col gap-5">
          {/* 任务概览（紧凑统计） */}
          <Card className="p-5">
            <SectionHeading title="数据概览" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat icon={<CheckSquare size={14} />} label="任务" value={`${stats.tasksDone}/${stats.tasksTotal}`} onClick={() => jumpTo('tasks')} />
              <MiniStat icon={<Bookmark size={14} />} label="收藏" value={stats.collectionCount} onClick={() => jumpTo('collections')} />
              <MiniStat icon={<FolderOpen size={14} />} label="文件" value={stats.fileCount} onClick={() => jumpTo('files')} />
              <MiniStat icon={<StickyNote size={14} />} label="笔记" value={stats.noteCount} onClick={() => jumpTo('notes')} />
            </div>
          </Card>

          {/* 快捷操作 */}
          <Card className="p-5">
            <SectionHeading title="快捷操作" />
            <div className="mt-3 flex flex-col gap-2">
              <QuickAction icon={<CheckSquare size={15} />} label="前往任务" onClick={() => jumpTo('tasks')} />
              <QuickAction icon={<Plus size={15} />} label="添加收藏" onClick={() => jumpTo('collections')} />
              <QuickAction icon={<FolderOpen size={15} />} label="索引文件" onClick={() => jumpTo('files')} />
              <QuickAction icon={<CalendarDays size={15} />} label="查看时间轴" onClick={() => jumpTo('timeline')} />
            </div>
            <button
              onClick={() => void refresh()}
              className="mt-3 flex items-center gap-1.5 px-1 text-xs text-text-3 transition-colors hover:text-text"
            >
              <RefreshCw size={12} /> 刷新数据
            </button>
          </Card>

          {/* 最近访问 */}
          {recents.length > 0 && (
            <Card className="p-5">
              <SectionHeading title="最近访问" />
              <div className="mt-2 flex flex-col gap-0.5">
                {recents.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-text-2 transition-colors hover:bg-surface-2 hover:text-text"
                  >
                    <History size={13} className="text-text-3" />
                    {RECENT_PAGE_NAMES[p] ?? p}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <p className="flex items-center gap-1.5 px-1 text-[11px] text-text-3">
            <ShieldCheck size={12} className="shrink-0 text-success" />
            本地优先 · 所有数据仅保存在本设备
          </p>
        </div>
      </div>
    </div>
  )
}

function RecentRow({
  icon,
  tag,
  onClick,
  children,
  dim = false
}: {
  icon: React.ReactNode
  tag: string
  onClick: () => void
  children: React.ReactNode
  dim?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-2 ${
        dim ? 'opacity-60' : ''
      }`}
    >
      <span className="text-text-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-text">{children}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-3">{tag}</span>
    </button>
  )
}

function MiniStat({
  icon,
  label,
  value,
  onClick
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  onClick: () => void
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-3"
    >
      <span className="text-text-3">{icon}</span>
      <span className="min-w-0">
        <span className="block font-mono text-base font-bold leading-5 tabular-nums text-text">{value}</span>
        <span className="block text-[11px] text-text-3">{label}</span>
      </span>
    </motion.button>
  )
}

function QuickAction({
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
      className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs font-medium text-text-2 transition-all hover:border-primary/40 hover:text-text active:scale-[0.97]"
    >
      {icon}
      {label}
    </button>
  )
}
