/**
 * Tasks 任务管理页：新建/编辑/删除/完成/拖拽排序/筛选。
 * 视图规则：Today = 未完成且(无截止日期或 ≤ 今天，逾期自动延续)；
 * Upcoming = 未完成且晚于今天；Completed 按完成时间倒序。重要事项置顶。
 */
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, Reorder, motion } from 'framer-motion'
import { Plus, Trash2, Pencil, Star, CalendarDays, GripVertical, Search } from 'lucide-react'
import type { Task, TaskInput, TaskView, Priority } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PriorityDot,
  Select,
  SkeletonList,
  Tag,
  Textarea
} from '../components/ui'

const VIEWS: Array<{ value: TaskView; label: string }> = [
  { value: 'today', label: '今天' },
  { value: 'upcoming', label: '未来' },
  { value: 'completed', label: '已完成' },
  { value: 'all', label: '全部' }
]

export function TasksPage() {
  const { toast, jumpTarget } = useApp()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [view, setView] = useState<TaskView>('today')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  const load = useCallback(async () => {
    try {
      setTasks(await api.tasks.list({ view, priority, search }))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载任务失败')
    }
  }, [view, priority, search, toast])

  useEffect(() => {
    setTasks(null)
    void load()
  }, [load])

  // 从其他页面跳转过来时刷新
  useEffect(() => {
    if (jumpTarget?.page === 'tasks') void load()
  }, [jumpTarget, load])

  const toggle = async (t: Task) => {
    try {
      await api.tasks.toggle(t.id)
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '更新任务失败')
    }
  }

  const removeTask = async (t: Task) => {
    try {
      await api.tasks.remove(t.id)
      toast('success', '任务已删除')
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '删除任务失败')
    }
  }

  const toggleImportant = async (t: Task) => {
    try {
      await api.tasks.update(t.id, { isImportant: !t.isImportant })
      await load()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '更新任务失败')
    }
  }

  // 拖拽排序持久化（仅对当前视图内顺序生效）
  const onReorder = async (next: Task[]) => {
    setTasks(next)
    try {
      await api.tasks.reorder(next.map((t) => t.id))
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存排序失败')
      await load()
    }
  }

  const canReorder = view === 'today' || view === 'upcoming' || view === 'all'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold text-text">任务</h1>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索…" className="!w-56 !pl-8" />
        </div>
        <Select
          value={priority}
          onChange={(v) => setPriority(v as 'all' | Priority)}
          options={[
            { value: 'all', label: '全部优先级' },
            { value: 'high', label: '高' },
            { value: 'medium', label: '中' },
            { value: 'low', label: '低' }
          ]}
        />
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null)
            setEditorOpen(true)
          }}
        >
          <Plus size={16} /> 新建任务
        </Button>
      </div>

      <div className="flex gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            onClick={() => setView(v.value)}
            className={`rounded-xl px-3.5 py-1.5 text-sm transition-colors ${
              view === v.value
                ? 'bg-primary font-medium text-on-primary shadow-soft'
                : 'text-text-2 hover:bg-surface-3'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {tasks === null ? (
        <SkeletonList rows={5} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={36} />}
          title="这里还没有任务"
          hint={
            view === 'today'
              ? '添加一个任务开始使用。之前日期未完成的任务会自动延续到「今天」。'
              : '使用上方按钮创建一个任务。'
          }
          action={
            <Button variant="primary" onClick={() => { setEditing(null); setEditorOpen(true) }}>
              <Plus size={16} /> 新建任务
            </Button>
          }
        />
      ) : canReorder ? (
        <Reorder.Group axis="y" values={tasks} onReorder={onReorder} className="flex flex-col gap-2.5">
          {tasks.map((t) => (
            <Reorder.Item key={t.id} value={t} className="!list-none">
              <TaskRow
                task={t}
                onToggle={() => void toggle(t)}
                onEdit={() => {
                  setEditing(t)
                  setEditorOpen(true)
                }}
                onDelete={() => void removeTask(t)}
                onImportant={() => void toggleImportant(t)}
                draggable={canReorder}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onToggle={() => void toggle(t)}
                onEdit={() => {
                  setEditing(t)
                  setEditorOpen(true)
                }}
                onDelete={() => void removeTask(t)}
                onImportant={() => void toggleImportant(t)}
                draggable={false}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <TaskEditorModal
        open={editorOpen}
        task={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          setEditorOpen(false)
          await load()
        }}
      />
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  onImportant,
  draggable
}: {
  task: Task
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onImportant: () => void
  draggable: boolean
}) {
  const today = localToday()
  const overdue = !task.completed && task.dueDate !== null && task.dueDate < today
  const dueToday = !task.completed && task.dueDate === today

  return (
    <motion.div layout="position" initial={false}>
      <Card
        hover={!task.completed}
        className={`group flex items-center gap-3 px-4 py-3 ${task.completed ? 'opacity-60' : ''} ${
          overdue ? 'border-danger/40' : ''
        }`}
      >
        {draggable && (
          <GripVertical size={15} className="shrink-0 cursor-grab text-text-3 opacity-0 transition-opacity group-hover:opacity-100" />
        )}
        {/* 完成勾选（带动画） */}
        <motion.button
          whileTap={{ scale: 0.8 }}
          onClick={onToggle}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            task.completed ? 'border-primary bg-primary' : 'border-border-strong hover:border-primary'
          }`}
        >
          {task.completed && (
            <motion.svg
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              viewBox="0 0 12 12"
              className="h-3 w-3 text-on-primary"
            >
              <path d="M2 6.5L4.5 9L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </motion.svg>
          )}
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <PriorityDot priority={task.priority} />
            <span
              className={`truncate text-sm ${
                task.completed ? 'text-text-3 line-through' : 'font-medium text-text'
              }`}
            >
              {task.title}
            </span>
            {task.isImportant && <Star size={13} className="shrink-0 fill-warning text-warning" />}
            {overdue && <Tag className="!bg-danger/10 !text-danger">已逾期</Tag>}
            {dueToday && <Tag>今天</Tag>}
          </div>
          {(task.dueDate || task.dueTime || task.notes) && (
            <p className="mt-0.5 truncate text-xs text-text-3">
              {task.dueDate && (
                <span className={overdue ? 'font-medium text-danger' : ''}>
                  {task.dueDate}
                  {task.dueTime ? ` ${task.dueTime}` : ''}
                </span>
              )}
              {task.notes ? ` · ${task.notes}` : ''}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn onClick={onImportant} title={task.isImportant ? '取消置顶' : '置顶为重要'}>
            <Star size={14} className={task.isImportant ? 'fill-warning text-warning' : ''} />
          </IconBtn>
          <IconBtn onClick={onEdit} title="编辑">
            <Pencil size={14} />
          </IconBtn>
          <IconBtn onClick={onDelete} title="删除" danger>
            <Trash2 size={14} />
          </IconBtn>
        </div>
      </Card>
    </motion.div>
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

function TaskEditorModal({
  open,
  task,
  onClose,
  onSaved
}: {
  open: boolean
  task: Task | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { toast } = useApp()
  const [form, setForm] = useState<TaskInput>({ title: '', notes: '', priority: 'medium', dueDate: null, dueTime: null, isImportant: false })
  const [hasDue, setHasDue] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setForm({
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        isImportant: task.isImportant
      })
      setHasDue(task.dueDate !== null)
    } else {
      setForm({ title: '', notes: '', priority: 'medium', dueDate: localToday(), dueTime: null, isImportant: false })
      setHasDue(true)
    }
  }, [open, task])

  const submit = async () => {
    const title = form.title.trim()
    if (!title) return
    setBusy(true)
    try {
      const payload: TaskInput = { ...form, title, dueDate: hasDue ? form.dueDate : null }
      if (task) {
        await api.tasks.update(task.id, payload)
        toast('success', '任务已更新')
      } else {
        await api.tasks.create(payload)
        toast('success', '任务已创建')
      }
      await onSaved()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存任务失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={task ? '编辑任务' : '新建任务'}>
      <Field label="标题">
        <Input
          autoFocus
          value={form.title}
          onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="需要做什么？"
        />
      </Field>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Field label="优先级">
          <Select
            value={form.priority ?? 'medium'}
            onChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}
            options={[
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' }
            ]}
          />
        </Field>
        <Field label="截止日期">
          {hasDue ? (
            <Input
              type="date"
              value={form.dueDate ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, dueDate: v || null }))}
            />
          ) : (
            <Button className="w-full" onClick={() => setHasDue(true)}>
              <CalendarDays size={14} /> 设置日期
            </Button>
          )}
        </Field>
        <Field label="截止时间">
          <Input
            type="time"
            value={form.dueTime ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, dueTime: v || null }))}
          />
        </Field>
      </div>
      <Field label="备注">
        <Textarea
          value={form.notes ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
          placeholder="补充说明（可选）…"
          rows={3}
        />
      </Field>
      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-text-2">
        <input
          type="checkbox"
          checked={form.isImportant ?? false}
          onChange={(e) => setForm((f) => ({ ...f, isImportant: e.target.checked }))}
          className="h-4 w-4 accent-[rgb(var(--c-primary))]"
        />
        标记为重要（置顶显示）
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={!form.title.trim() || busy}>
          {task ? '保存修改' : '创建任务'}
        </Button>
      </div>
    </Modal>
  )
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
