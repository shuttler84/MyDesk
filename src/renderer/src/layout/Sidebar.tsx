/**
 * 左侧固定导航栏。
 */
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  CheckSquare,
  Bookmark,
  Lock,
  FolderOpen,
  StickyNote,
  Activity,
  Settings as SettingsIcon
} from 'lucide-react'
import type { PageId } from '@shared/types'
import { useApp } from '../store/AppStore'

const NAV: Array<{ id: PageId; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: '首页', icon: <LayoutDashboard size={19} /> },
  { id: 'tasks', label: '任务', icon: <CheckSquare size={19} /> },
  { id: 'collections', label: '收藏', icon: <Bookmark size={19} /> },
  { id: 'vault', label: '保险箱', icon: <Lock size={19} /> },
  { id: 'files', label: '文件索引', icon: <FolderOpen size={19} /> },
  { id: 'notes', label: '笔记', icon: <StickyNote size={19} /> },
  { id: 'timeline', label: '时间轴', icon: <Activity size={19} /> },
  { id: 'settings', label: '设置', icon: <SettingsIcon size={19} /> }
]

export function Sidebar() {
  const { page, setPage } = useApp()

  return (
    <nav className="glass-card flex h-full w-[216px] shrink-0 flex-col border-r border-border bg-surface px-3 py-5">
      <div className="mb-7 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-soft">
          <LayoutDashboard size={18} />
        </div>
        <div>
          <p className="text-[15px] font-bold tracking-wide text-text">MyDesk</p>
          <p className="text-[10px] text-text-3">个人数字工作台</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = page === item.id
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 ${
                active
                  ? 'bg-primary-soft font-semibold text-primary'
                  : 'text-text-2 hover:bg-surface-2 hover:text-text'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active-dot"
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                />
              )}
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>

      <p className="px-3 text-[10px] leading-4 text-text-3">本地优先 · 数据仅保存在本设备</p>
    </nav>
  )
}
