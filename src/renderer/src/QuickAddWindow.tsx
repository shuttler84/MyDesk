/**
 * 全局快速添加窗口（独立无边框窗口，Ctrl+Shift+Space 呼出）。
 * 智能识别输入类型（URL/GitHub/文件路径/文本），允许手动切换；Enter 保存，Esc 关闭。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckSquare, StickyNote, Globe, Github, FolderOpen, Zap } from 'lucide-react'
import type { QuickAddKind } from '@shared/types'
import { parseQuickAddInput, quickAddKindLabel } from '@shared/quickAdd'
import { api } from './api/client'

const KINDS: Array<{ kind: QuickAddKind; label: string; icon: React.ReactNode }> = [
  { kind: 'task', label: '任务', icon: <CheckSquare size={13} /> },
  { kind: 'note', label: '笔记', icon: <StickyNote size={13} /> },
  { kind: 'url', label: '网站收藏', icon: <Globe size={13} /> },
  { kind: 'github', label: 'GitHub', icon: <Github size={13} /> },
  { kind: 'file', label: '文件索引', icon: <FolderOpen size={13} /> }
]

export function QuickAddWindow() {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<QuickAddKind>('task')
  const [hint, setHint] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => (text.trim() ? parseQuickAddInput(text.trim()) : null), [text])

  // 输入变化时同步识别结果（用户未手动覆盖时）
  useEffect(() => {
    if (parsed) {
      setKind(parsed.kind)
      setHint(parsed.hint)
    } else {
      setHint('')
    }
  }, [parsed])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const save = async () => {
    const t = text.trim()
    if (!t || status === 'saving') return
    setStatus('saving')
    try {
      await api.quickAdd.save(kind, t)
      setStatus('saved')
      setTimeout(() => window.close(), 400)
    } catch (err) {
      setStatus('idle')
      // 无 Toast 容器（独立窗口），失败时显示在提示行
      setHint(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent p-2">
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16 }}
        className="glass-card flex h-full flex-col rounded-2xl border border-border shadow-modal"
      >
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <Zap size={14} className="shrink-0 text-primary" />
          {/* 类型切换 */}
          <div className="flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                onClick={() => setKind(k.kind)}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors ${
                  kind === k.kind ? 'bg-primary font-medium text-on-primary' : 'text-text-2 hover:bg-surface-3'
                }`}
              >
                {k.icon}
                {k.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <span className="text-[10px] text-text-3">Enter 保存 · Esc 关闭</span>
        </div>
        <div className="flex items-center gap-2 px-3 pb-2.5 pt-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (status === 'saved') setStatus('idle')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') window.close()
            }}
            placeholder="输入内容快速添加：链接、文件路径或任务文本…"
            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3.5 text-sm text-text placeholder:text-text-3 outline-none transition-colors focus:border-primary"
          />
          <button
            onClick={() => void save()}
            disabled={!text.trim() || status !== 'idle'}
            className="btn-primary h-9 shrink-0 rounded-xl px-4 text-sm font-medium text-on-primary disabled:opacity-50"
          >
            {status === 'saving' ? '保存中…' : status === 'saved' ? '✓ 已保存' : '添加'}
          </button>
        </div>
        {hint && (
          <p className="truncate px-3 pb-2 text-[11px] text-text-3">
            {quickAddKindLabel(kind)} · {hint}
          </p>
        )}
      </motion.div>
    </div>
  )
}
