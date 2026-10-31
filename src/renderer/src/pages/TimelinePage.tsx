/**
 * Timeline 时间轴与统计：每日任务完成 / 收藏 / 笔记 / 文件索引计数，
 * 最近活动列表，基础日期筛选。年度热力图在第三阶段完善。
 */
import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import type { TimelineStats } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, EmptyState, Input, SkeletonList } from '../components/ui'

const ACTIVITY_LABELS: Record<string, string> = {
  task_created: '任务创建',
  task_completed: '任务完成',
  collection_created: '新增收藏',
  file_created: '文件索引',
  note_created: '新建笔记',
  backup_exported: '备份导出',
  backup_imported: '备份导入',
  vault_setup: '保险箱创建',
  vault_unlocked: '保险箱解锁'
}

export function TimelinePage() {
  const { toast } = useApp()
  const [stats, setStats] = useState<TimelineStats | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    try {
      setStats(await api.timeline.stats({ from: from || null, to: to || null }))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载时间轴失败')
    }
  }, [from, to, toast])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold text-text">时间轴</h1>
        <label className="flex items-center gap-2 text-xs text-text-2">
          从 <Input type="date" value={from} onChange={setFrom} className="!w-40" />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-2">
          到 <Input type="date" value={to} onChange={setTo} className="!w-40" />
        </label>
        {(from || to) && (
          <Button variant="ghost" className="text-xs" onClick={() => { setFrom(''); setTo('') }}>
            清除
          </Button>
        )}
        <Button className="text-xs" onClick={() => void load()}>
          <RefreshCw size={13} /> 刷新
        </Button>
      </div>

      {stats === null ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          {/* 每日计数图（轻量条形图，主题令牌驱动） */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <DailyCard title="每日完成任务" data={stats.tasks} color="rgb(var(--c-primary))" />
            <DailyCard title="每日新增收藏" data={stats.collections} color="rgb(var(--c-accent))" />
            <DailyCard title="每日新增笔记" data={stats.notes} color="rgb(var(--c-warning))" />
            <DailyCard title="每日索引文件" data={stats.files} color="rgb(var(--c-success))" />
          </div>

          {/* 最近活动 */}
          <Card className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text">
              <Activity size={15} className="text-primary" /> 最近活动
            </h3>
            {stats.activities.length === 0 ? (
              <EmptyState
                icon={<Activity size={30} />}
                title="暂无活动记录"
                hint="创建任务、保存收藏或撰写笔记——你的活动会显示在这里。"
              />
            ) : (
              <div className="relative ml-2 border-l-2 border-border pl-5">
                {stats.activities.map((a) => (
                  <div key={a.id} className="relative mb-4 last:mb-0">
                    <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                    <p className="text-sm text-text">
                      <span className="mr-2 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-text-2">
                        {ACTIVITY_LABELS[a.type] ?? a.type}
                      </span>
                      {a.title}
                    </p>
                    <p className="text-[10px] text-text-3">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function DailyCard({
  title,
  data,
  color
}: {
  title: string
  data: Array<{ date: string; count: number }>
  color: string
}) {
  // 最多显示最近 14 天
  const recent = data.slice(-14)
  const max = Math.max(1, ...recent.map((d) => d.count))
  const total = data.reduce((s, d) => s + d.count, 0)

  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-text-2">{title}</p>
      <p className="mb-2 text-xl font-bold text-text">{total}</p>
      {recent.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-3">该范围内没有数据</p>
      ) : (
        <div className="flex h-14 items-end gap-1">
          {recent.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}`}
              className="flex-1 rounded-t-sm transition-all duration-500"
              style={{
                height: `${Math.max(8, (d.count / max) * 100)}%`,
                backgroundColor: color,
                opacity: 0.85
              }}
            />
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-text-3">
        {recent.length > 0 ? `${recent[0].date} → ${recent[recent.length - 1].date}` : ''}
      </p>
    </Card>
  )
}
