/**
 * Timeline 时间轴与统计（阶段三升级版）：
 * - 年度活动热力图（GitHub Contributions 风格，按日聚合四类活动，点击查看当日明细）
 * - 年度切换、月度任务完成统计
 * - 收藏类型分布、标签使用 Top、活动类型筛选
 * 全部数据来自真实数据库，无历史数据的日期显示为空。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { DailyCount, TimelineStats } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Card, EmptyState, Modal, PageHeader, PageToolbar, SectionHeading, SkeletonList, Tag } from '../components/ui'

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

const TYPE_LABELS: Record<string, string> = {
  website: '网站',
  github: 'GitHub',
  bilibili: 'Bilibili',
  youtube: 'YouTube',
  forum: '论坛',
  article: '文章',
  custom: '自定义'
}

type HeatKind = 'all' | 'tasks' | 'collections' | 'notes' | 'files'

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function TimelinePage() {
  const { toast } = useApp()
  const [stats, setStats] = useState<TimelineStats | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [heatKind, setHeatKind] = useState<HeatKind>('all')
  const [detailDate, setDetailDate] = useState<string | null>(null)

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

  /** 热力图数据：kind -> 日期计数映射 */
  const heatData = useMemo(() => {
    const map = new Map<string, number>()
    if (!stats) return map
    const add = (list: DailyCount[]) => {
      for (const d of list) map.set(d.date, (map.get(d.date) ?? 0) + d.count)
    }
    if (heatKind === 'all' || heatKind === 'tasks') add(stats.tasks)
    if (heatKind === 'all' || heatKind === 'collections') add(stats.collections)
    if (heatKind === 'all' || heatKind === 'notes') add(stats.notes)
    if (heatKind === 'all' || heatKind === 'files') add(stats.files)
    return map
  }, [stats, heatKind])

  const sum = (list: DailyCount[]): number => list.reduce((s, d) => s + d.count, 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="时间轴" description="你的每一次整理都被本地记录。" />

      <PageToolbar>
        <label className="flex items-center gap-2 text-xs text-text-2">
          从 <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-2">
          到 <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary" />
        </label>
        {(from || to) && (
          <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }}>
            清除
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={() => void load()}>
          <RefreshCw size={13} /> 刷新
        </Button>
      </PageToolbar>

      {stats === null ? (
        <SkeletonList rows={5} />
      ) : (
        <>
          {/* 关键统计 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KeyStat label="任务完成" value={sum(stats.tasks)} />
            <KeyStat label="新增收藏" value={sum(stats.collections)} />
            <KeyStat label="新建笔记" value={sum(stats.notes)} />
            <KeyStat label="索引文件" value={sum(stats.files)} />
          </div>

          {/* 年度热力图 */}
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <SectionHeading title="年度活动热力图" />
              <div className="flex items-center gap-1">
                <Button className="!px-1.5 !py-1" onClick={() => setYear((y) => y - 1)}>
                  <ChevronLeft size={14} />
                </Button>
                <span className="min-w-14 text-center font-mono text-sm font-semibold text-text">{year}</span>
                <Button className="!px-1.5 !py-1" onClick={() => setYear((y) => y + 1)} disabled={year >= new Date().getFullYear()}>
                  <ChevronRight size={14} />
                </Button>
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {(
                  [
                    ['all', '全部'],
                    ['tasks', '任务完成'],
                    ['collections', '收藏'],
                    ['notes', '笔记'],
                    ['files', '文件索引']
                  ] as Array<[HeatKind, string]>
                ).map(([k, label]) => (
                  <Tag key={k} active={heatKind === k} onClick={() => setHeatKind(k)}>
                    {label}
                  </Tag>
                ))}
              </div>
            </div>
            <Heatmap year={year} data={heatData} onPick={(d) => setDetailDate(d)} />
            <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-text-3">
              少
              {[0, 1, 2, 3, 4].map((lv) => (
                <span key={lv} className={`h-3 w-3 rounded-sm ${HEAT_CLASS[lv]}`} />
              ))}
              多
            </div>
          </Card>

          {/* 月度统计 + 分布 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-5">
              <SectionHeading title="每月任务完成" />
              {stats.monthlyTasks.length === 0 ? (
                <p className="py-6 text-center text-xs text-text-3">该范围内没有数据</p>
              ) : (
                <div className="flex h-28 items-end gap-1.5">
                  {stats.monthlyTasks.slice(-12).map((m) => {
                    const max = Math.max(...stats.monthlyTasks.slice(-12).map((x) => x.completed), 1)
                    return (
                      <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${m.month}: ${m.completed}`}>
                        <div
                          className="w-full rounded-t-md bg-primary transition-all"
                          style={{ height: `${Math.max(6, (m.completed / max) * 88)}px`, opacity: 0.85 }}
                        />
                        <span className="truncate text-[9px] text-text-3">{m.month.slice(5)}月</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <SectionHeading title="收藏类型分布" />
              {stats.typeDistribution.length === 0 ? (
                <p className="py-6 text-center text-xs text-text-3">该范围内没有数据</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {stats.typeDistribution.map((t) => {
                    const total = stats.typeDistribution.reduce((s, x) => s + x.count, 0)
                    return (
                      <div key={t.type} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 text-xs text-text-2">{TYPE_LABELS[t.type] ?? t.type}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(t.count / Math.max(total, 1)) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-xs text-text">{t.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* 标签使用 Top */}
          {stats.tagUsage.length > 0 && (
            <Card className="p-5">
              <SectionHeading title={`标签使用（Top ${stats.tagUsage.length}）`} />
              <div className="flex flex-wrap gap-2">
                {stats.tagUsage.map((t) => (
                  <span key={t.tag} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1 text-xs text-primary">
                    {t.tag}
                    <span className="rounded-md bg-primary/15 px-1.5 font-mono">{t.count}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* 每日计数（保留第一阶段视图） */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <DailyCard title="每日完成任务" data={stats.tasks} color="rgb(var(--c-primary))" />
            <DailyCard title="每日新增收藏" data={stats.collections} color="rgb(var(--c-accent))" />
            <DailyCard title="每日新增笔记" data={stats.notes} color="rgb(var(--c-warning))" />
            <DailyCard title="每日索引文件" data={stats.files} color="rgb(var(--c-success))" />
          </div>

          {/* 最近活动 */}
          <Card className="p-5">
            <SectionHeading
              title="最近活动"
              extra={<Activity size={15} className="text-primary" />}
            />
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

      {/* 日期详情 */}
      <DayDetailModal date={detailDate} onClose={() => setDetailDate(null)} stats={stats} />
    </div>
  )
}

const HEAT_CLASS = ['bg-surface-3', 'bg-primary/25', 'bg-primary/45', 'bg-primary/70', 'bg-primary']

/** GitHub Contributions 风格热力图 */
function Heatmap({
  year,
  data,
  onPick
}: {
  year: number
  data: Map<string, number>
  onPick: (date: string) => void
}) {
  const cells = useMemo(() => {
    const out: Array<Array<{ date: string; count: number } | null>> = []
    const d = new Date(year, 0, 1)
    d.setDate(d.getDate() - d.getDay()) // 回退到周日
    const today = fmt(new Date())
    const end = new Date(year, 11, 31)
    let week: Array<{ date: string; count: number } | null> = []
    let guard = 0
    while (d <= end && guard < 400) {
      const dateStr = fmt(d)
      const inYear = d.getFullYear() === year
      const count = inYear && dateStr <= today ? (data.get(dateStr) ?? 0) : -1
      week.push(inYear ? { date: dateStr, count } : null)
      if (week.length === 7) {
        out.push(week)
        week = []
      }
      d.setDate(d.getDate() + 1)
      guard++
    }
    if (week.length > 0) out.push(week)
    return out
  }, [year, data])

  const level = (count: number): number => (count <= 0 ? 0 : count < 2 ? 1 : count < 4 ? 2 : count < 8 ? 3 : 4)

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px]">
        {cells.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell, di) =>
              cell ? (
                <button
                  key={cell.date}
                  title={`${cell.date}：${cell.count} 项活动`}
                  onClick={() => onPick(cell.date)}
                  className={`h-3.5 w-3.5 rounded-sm transition-transform hover:scale-125 ${HEAT_CLASS[level(cell.count)]}`}
                />
              ) : (
                <span key={`${wi}-${di}`} className="h-3.5 w-3.5" />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 点击日期：查看当日各项明细 */
function DayDetailModal({
  date,
  onClose,
  stats
}: {
  date: string | null
  onClose: () => void
  stats: TimelineStats | null
}) {
  if (!date) return null
  const pick = (list: DailyCount[]): number => list.find((d) => d.date === date)?.count ?? 0
  const acts = (stats?.activities ?? []).filter((a) => a.createdAt.slice(0, 10) === date)
  return (
    <Modal open={!!date} onClose={onClose} title={`${date} 的活动`}>
      <div className="mb-4 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['任务完成', pick(stats?.tasks ?? [])],
            ['新增收藏', pick(stats?.collections ?? [])],
            ['新增笔记', pick(stats?.notes ?? [])],
            ['索引文件', pick(stats?.files ?? [])]
          ] as Array<[string, number]>
        ).map(([label, n]) => (
          <div key={label} className="rounded-xl bg-surface-2 px-2 py-3">
            <p className="text-lg font-bold text-text">{n}</p>
            <p className="text-[10px] text-text-3">{label}</p>
          </div>
        ))}
      </div>
      {acts.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-3">这一天没有详细活动记录</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {acts.map((a) => (
            <div key={a.id} className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">
              <span className="mr-2 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px]">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
              {a.title}
            </div>
          ))}
        </div>
      )}
    </Modal>
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
              style={{ height: `${Math.max(8, (d.count / max) * 100)}%`, backgroundColor: color, opacity: 0.85 }}
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

function KeyStat({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="subtle" className="px-4 py-3">
      <p className="font-mono text-xl font-bold tabular-nums text-text">{value}</p>
      <p className="mt-0.5 text-[11px] text-text-3">{label}</p>
    </Card>
  )
}
