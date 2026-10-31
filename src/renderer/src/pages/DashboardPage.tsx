/**
 * Dashboard 首页：日期时间、今日任务进度、统计、重要事项、最近内容、快捷操作。
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
  ChevronRight
} from 'lucide-react'
import type { DashboardStats, Task, Collection, FileIndexItem, Note } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, EmptyState, PriorityDot, ProgressBar, Skeleton } from '../components/ui'

export function DashboardPage() {
  const { toast, jumpTo } = useApp()
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
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full" />
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

  return (
    <div className="flex flex-col gap-5">
      {/* 日期时间 + 今日进度 */}
      <Card className="flex items-center justify-between px-6 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-3">{greeting}</p>
          <p className="mt-1 text-2xl font-bold text-text">
            {stats.date}
            <span className="ml-3 text-base font-medium text-text-2">{stats.weekday}</span>
          </p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-text-3">
            {clock.toLocaleTimeString()}
          </p>
        </div>
        <div className="w-72">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs text-text-2">今日任务</span>
            <span className="font-mono text-sm font-semibold text-text">
              {stats.tasksDone}/{stats.tasksTotal}
            </span>
          </div>
          <ProgressBar value={progress} />
          <p className="mt-1.5 text-right text-xs text-text-3">{Math.round(progress)}% 已完成</p>
        </div>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<Bookmark size={18} />}
          label="收藏"
          value={stats.collectionCount}
          onClick={() => jumpTo('collections')}
        />
        <StatCard
          icon={<FolderOpen size={18} />}
          label="文件索引"
          value={stats.fileCount}
          onClick={() => jumpTo('files')}
        />
        <StatCard
          icon={<StickyNote size={18} />}
          label="笔记"
          value={stats.noteCount}
          onClick={() => jumpTo('notes')}
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* 重要事项 */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <Star size={15} className="text-warning" /> 重要事项
            </h3>
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => jumpTo('tasks')}>
              全部任务 <ChevronRight size={13} />
            </Button>
          </div>
          {stats.importantTasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-text-3">
              暂无重要的未完成任务。将任务标记为重要后会置顶显示在这里。
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {stats.importantTasks.map((t: Task) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
                >
                  <PriorityDot priority={t.priority} />
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{t.title}</span>
                  {t.dueDate && (
                    <span
                      className={`shrink-0 font-mono text-xs ${
                        t.dueDate < stats.date ? 'text-danger' : 'text-text-3'
                      }`}
                    >
                      {t.dueDate}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 最近收藏 + 最近文件 */}
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                <Bookmark size={15} className="text-primary" /> 最近收藏
              </h3>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => jumpTo('collections')}>
                查看全部 <ChevronRight size={13} />
              </Button>
            </div>
            {stats.recentCollections.length === 0 ? (
              <EmptyMini icon={<Bookmark size={20} />} text="还没有收藏——保存第一个链接吧" />
            ) : (
              stats.recentCollections.map((c: Collection) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{c.name}</span>
                  <span className="shrink-0 text-[10px] uppercase text-text-3">{c.type}</span>
                </div>
              ))
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                <FolderOpen size={15} className="text-accent" /> 最近文件
              </h3>
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => jumpTo('files')}>
                查看全部 <ChevronRight size={13} />
              </Button>
            </div>
            {stats.recentFiles.length === 0 ? (
              <EmptyMini icon={<FolderOpen size={20} />} text="还没有文件索引记录" />
            ) : (
              stats.recentFiles.map((f: FileIndexItem) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2 ${
                    f.isInvalid ? 'opacity-60' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{f.name}</span>
                  {f.isInvalid && <span className="shrink-0 text-[10px] text-danger">已失效</span>}
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      {/* 最近笔记 + 快捷操作 */}
      <div className="grid grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
              <StickyNote size={15} className="text-warning" /> 最近笔记
            </h3>
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => jumpTo('notes')}>
              查看全部 <ChevronRight size={13} />
            </Button>
          </div>
          {stats.recentNotes.length === 0 ? (
            <EmptyMini icon={<StickyNote size={20} />} text="写下第一篇笔记就会显示在这里" />
          ) : (
            stats.recentNotes.map((n: Note) => (
              <div
                key={n.id}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-text">{n.title || '（无标题）'}</span>
                <span className="shrink-0 font-mono text-[10px] text-text-3">
                  {n.updatedAt.slice(0, 10)}
                </span>
              </div>
            ))
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-text">快捷操作</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction icon={<CheckSquare size={16} />} label="前往任务" onClick={() => jumpTo('tasks')} />
            <QuickAction icon={<Plus size={16} />} label="添加收藏" onClick={() => jumpTo('collections')} />
            <QuickAction icon={<FolderOpen size={16} />} label="索引文件" onClick={() => jumpTo('files')} />
            <QuickAction icon={<CalendarDays size={16} />} label="查看时间轴" onClick={() => jumpTo('timeline')} />
          </div>
          <div className="mt-4">
            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => void refresh()}>
              <RefreshCw size={13} /> 刷新
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  onClick
}: {
  icon: React.ReactNode
  label: string
  value: number
  onClick: () => void
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      onClick={onClick}
      className="glass-card flex cursor-pointer items-center gap-4 rounded-2xl border border-border px-5 py-4 shadow-soft"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-text">{value}</p>
        <p className="text-xs text-text-3">{label}</p>
      </div>
    </motion.div>
  )
}

function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-4 text-text-3">
      {icon}
      <p className="text-xs">{text}</p>
    </div>
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
