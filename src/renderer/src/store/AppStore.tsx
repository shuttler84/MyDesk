/**
 * 全局应用状态：设置（含主题/动画）、当前页面、Toast 通知。
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import type { AppSettings, PageId, ThemeName } from '@shared/types'
import { api } from '../api/client'
import { THEME_REGISTRY } from '@shared/themes'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
}

interface AppState {
  settings: AppSettings | null
  page: PageId
  setPage: (p: PageId) => void
  /** 最近访问的页面（不含当前页，最多 3 个，localStorage 持久化） */
  recentPages: PageId[]
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  toast: (kind: Toast['kind'], message: string) => void
  toasts: Toast[]
  /** 全局搜索跳转信号 */
  jumpTarget: { page: PageId; ts: number } | null
  jumpTo: (p: PageId) => void
}

const Ctx = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

let toastSeq = 1

const RECENT_PAGES_KEY = 'mydesk-recent-pages'

function loadRecentPages(): PageId[] {
  try {
    const raw = localStorage.getItem(RECENT_PAGES_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is PageId => typeof x === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

function saveRecentPages(list: PageId[]): void {
  try {
    localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(list.slice(0, 3)))
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [page, setPageState] = useState<PageId>('dashboard')
  const [recentPages, setRecentPages] = useState<PageId[]>(loadRecentPages)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [jumpTarget, setJumpTarget] = useState<{ page: PageId; ts: number } | null>(null)
  const startPageApplied = useRef(false)

  // 切页时记录最近访问（去重、最新在前、最多 3 条）
  const setPage = useCallback((p: PageId) => {
    setPageState(p)
    setRecentPages((prev) => {
      const next = [p, ...prev.filter((x) => x !== p)].slice(0, 3)
      saveRecentPages(next)
      return next
    })
  }, [])

  useEffect(() => {
    void api.settings.get().then((s) => {
      setSettings(s)
      if (!startPageApplied.current) {
        startPageApplied.current = true
        setPage(s.startPage)
      }
    })
  }, [setPage])

  // 主题、字体与动画偏好同步到 <html data-theme / data-font / data-heading / data-animation>
  useEffect(() => {
    if (!settings) return
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.dataset.font = settings.fontFamily
    document.documentElement.dataset.heading = settings.headingFont
    document.documentElement.dataset.animation = settings.animation
  }, [settings])

  const patchSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await api.settings.set(patch)
    setSettings(next)
  }, [])

  const toast = useCallback((kind: Toast['kind'], message: string) => {
    const id = toastSeq++
    setToasts((t) => [...t.slice(-4), { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const jumpTo = useCallback((p: PageId) => {
    setPage(p)
    setJumpTarget({ page: p, ts: Date.now() })
  }, [setPage])

  const value = useMemo(
    () => ({ settings, page, setPage, recentPages, patchSettings, toast, toasts, jumpTarget, jumpTo }),
    [settings, page, setPage, recentPages, patchSettings, toast, toasts, jumpTarget, jumpTo]
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* 全局 Toast 区域 */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="glass-card pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl border border-border px-4 py-3 shadow-lifted"
            >
              {t.kind === 'success' && <CheckCircle2 size={18} className="shrink-0 text-success" />}
              {t.kind === 'error' && <XCircle size={18} className="shrink-0 text-danger" />}
              {t.kind === 'info' && <Info size={18} className="shrink-0 text-accent" />}
              <span className="text-sm text-text">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export const THEME_LABELS: Record<ThemeName, string> = Object.fromEntries(
  THEME_REGISTRY.map((t) => [t.id, t.label])
) as Record<ThemeName, string>
