/**
 * 通用 UI 组件库（MyDesk 2.0 设计系统）：
 * Card / Button / Input / Select / Textarea / Modal / Drawer / Tag / IconButton /
 * PageHeader / PageToolbar / SectionHeading / EmptyState / Skeleton / Toggle /
 * PriorityBadge / ProgressBar / Divider。
 * 组件不依赖任何具体主题名称，视觉全部由主题令牌驱动，兼容九种主题。
 */
import React, { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

// ---------- Card ----------

type CardVariant = 'default' | 'plain' | 'subtle' | 'outlined' | 'interactive'

export function Card({
  children,
  className = '',
  hover = false,
  variant = 'default'
}: {
  children: React.ReactNode
  className?: string
  hover?: boolean
  /** default 暖色调卡片 / plain 无底无框 / subtle 次级底色 / outlined 仅边框 / interactive 可交互卡片 */
  variant?: CardVariant
}) {
  const variants: Record<CardVariant, string> = {
    default: 'glass-card border border-border shadow-soft',
    plain: '',
    subtle: 'bg-surface-2 rounded-2xl',
    outlined: 'border border-border rounded-2xl',
    interactive: 'glass-card border border-border shadow-soft cursor-pointer'
  }
  return (
    <motion.div
      whileHover={hover || variant === 'interactive' ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={`rounded-2xl ${variants[variant]} ${className}`}
    >
      {children}
    </motion.div>
  )
}

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type ButtonSize = 'sm' | 'md' | 'lg'

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  title
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  const sizes: Record<ButtonSize, string> = {
    sm: 'rounded-lg px-2.5 py-1.5 text-xs gap-1',
    md: 'rounded-xl px-3.5 py-2 text-sm gap-1.5',
    lg: 'rounded-xl px-5 py-2.5 text-[15px] gap-2'
  }
  const base =
    'inline-flex select-none items-center justify-center font-medium transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50'
  const styles: Record<ButtonVariant, string> = {
    primary: 'btn-primary text-on-primary shadow-soft',
    secondary:
      'border border-border bg-surface-2 text-text hover:bg-surface-3 hover:border-border-strong',
    ghost: 'text-text-2 hover:bg-surface-3 hover:text-text',
    subtle: 'bg-surface-3/70 text-text hover:bg-surface-3',
    danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20'
  }
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${styles[variant]} ${className}`}>
      {children}
    </button>
  )
}

// ---------- IconButton ----------

export function IconButton({
  children,
  onClick,
  title,
  className = '',
  active = false
}: {
  children: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  title?: string
  className?: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${
        active ? 'bg-primary-soft text-primary' : 'text-text-2 hover:bg-surface-3 hover:text-text'
      } ${className}`}
    >
      {children}
    </button>
  )
}

// ---------- Divider ----------

export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px w-full bg-border ${className}`} />
}

// ---------- 输入 ----------

export const Input = React.forwardRef(function Input(
  {
    value,
    onChange,
    placeholder,
    type = 'text',
    className = '',
    onKeyDown,
    onBlur,
    onFocus,
    autoFocus,
    min,
    max,
    mono = false
  }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    type?: string
    className?: string
    onKeyDown?: (e: React.KeyboardEvent) => void
    onBlur?: () => void
    onFocus?: () => void
    autoFocus?: boolean
    min?: number
    max?: number
    mono?: boolean
  },
  ref: React.Ref<HTMLInputElement>
) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      min={min}
      max={max}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`field-input w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-sm text-text placeholder:text-text-3 outline-none transition-colors ${
        mono ? 'font-mono' : ''
      } ${className}`}
    />
  )
})

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  mono = false
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  className?: string
  mono?: boolean
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full resize-y rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-sm text-text placeholder:text-text-3 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 ${
        mono ? 'font-mono' : ''
      } ${className}`}
    />
  )
}

export function Select({
  value,
  onChange,
  options,
  className = ''
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`cursor-pointer rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors focus:border-primary ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-surface-3 border border-border'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

// ---------- Modal ----------

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className={`glass-card flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-border shadow-modal ${
              wide ? 'max-w-2xl' : 'max-w-md'
            }`}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-text">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-text-3 transition-colors hover:bg-surface-3 hover:text-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------- Tag / Badge ----------

type TagVariant = 'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'accent'

export function Tag({
  children,
  active = false,
  onClick,
  className = '',
  variant = 'primary'
}: {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
  className?: string
  /** 语义变体：primary 主题强调 / neutral 中性 / success / warning / danger / accent */
  variant?: TagVariant
}) {
  const variants: Record<TagVariant, string> = {
    primary: 'bg-primary-soft text-primary',
    neutral: 'bg-surface-3 text-text-2',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-danger/15 text-danger',
    accent: 'bg-accent/15 text-accent'
  }
  return (
    <span
      onClick={onClick}
      className={`inline-flex cursor-default items-center gap-1 rounded-lg px-2 py-0.5 text-xs transition-colors ${
        active ? 'bg-primary text-on-primary' : variants[variant]
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </span>
  )
}

export function PriorityDot({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const color =
    priority === 'high' ? 'bg-danger' : priority === 'medium' ? 'bg-warning' : 'bg-success'
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />
}

// ---------- EmptyState / Skeleton ----------

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong/60 px-6 py-14 text-center">
      <div className="mb-3 text-text-3">{icon}</div>
      <p className="text-sm font-medium text-text-2">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs leading-5 text-text-3">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-3 ${className}`} />
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

// ---------- ProgressBar ----------

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}

// ---------- 字段标签 ----------

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-medium text-text-2">{label}</span>
      {children}
    </label>
  )
}

// ---------- 页面布局组件（统一页面骨架：PageHeader → PageToolbar → Content） ----------

/** 页面头部：左侧标题（衬线标题字体）+ 描述，右侧主要操作 */
export function PageHeader({
  title,
  description,
  actions,
  className = ''
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-bold leading-tight tracking-wide text-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-text-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** 页面工具栏：搜索 / 筛选 / 排序 / 视图切换等次级操作的统一容器 */
export function PageToolbar({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-2/60 px-3 py-2.5 ${className}`}
    >
      {children}
    </div>
  )
}

/** 区块标题：模块小标题 + 右侧附加操作 */
export function SectionHeading({
  title,
  extra,
  className = ''
}: {
  title: string
  extra?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <h2 className="font-heading text-[15px] font-semibold tracking-wide text-text">{title}</h2>
      {extra}
    </div>
  )
}

// ---------- Drawer ----------

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 'max-w-md'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className={`glass-card absolute right-0 top-0 flex h-full w-full flex-col border-l border-border shadow-modal ${width}`}
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-text">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-text-3 transition-colors hover:bg-surface-3 hover:text-text"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
