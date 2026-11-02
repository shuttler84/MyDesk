/**
 * 侧边栏（MyDesk 2.0 App Shell）：核心工作空间导航。
 * - 品牌区 + 「＋ 新建」（复用 QuickAddModal，不重复新建逻辑）
 * - 导航分组：工作空间 / 资料库 / 回顾 / 管理；设置固定底部
 * - 最近访问（localStorage，最多 3 条，不显示虚构数据）
 * - 可折叠（localStorage 持久化），折叠时图标 + Tooltip
 * - 底部本地状态标识
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  CheckSquare,
  Bookmark,
  Lock,
  FolderOpen,
  StickyNote,
  Activity,
  Settings as SettingsIcon,
  HardDriveDownload,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  ShieldCheck
} from 'lucide-react'
import type { PageId } from '@shared/types'
import { useApp } from '../store/AppStore'

interface NavItem {
  id: PageId
  label: string
  icon: React.ReactNode
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '工作空间',
    items: [
      { id: 'dashboard', label: '首页', icon: <LayoutDashboard size={18} /> },
      { id: 'tasks', label: '任务', icon: <CheckSquare size={18} /> },
      { id: 'collections', label: '收藏', icon: <Bookmark size={18} /> }
    ]
  },
  {
    label: '资料库',
    items: [
      { id: 'vault', label: '保险箱', icon: <Lock size={18} /> },
      { id: 'files', label: '文件索引', icon: <FolderOpen size={18} /> },
      { id: 'notes', label: '笔记', icon: <StickyNote size={18} /> }
    ]
  },
  {
    label: '回顾',
    items: [{ id: 'timeline', label: '时间轴', icon: <Activity size={18} /> }]
  },
  {
    label: '管理',
    items: [{ id: 'data', label: '数据管理', icon: <HardDriveDownload size={18} /> }]
  }
]

const PAGE_NAMES: Record<PageId, string> = {
  dashboard: '首页',
  tasks: '任务',
  collections: '收藏',
  vault: '保险箱',
  files: '文件索引',
  notes: '笔记',
  timeline: '时间轴',
  data: '数据管理',
  settings: '设置'
}

const COLLAPSE_KEY = 'mydesk-sidebar-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function Sidebar({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { page, setPage, recentPages } = useApp()
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  const toggleCollapse = (): void => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1')
      } catch {
        /* ignore */
      }
      return !v
    })
  }

  const recents = recentPages.filter((p) => p !== page && p !== 'settings').slice(0, 3)

  const renderItem = (item: NavItem) => {
    const active = page === item.id
    return (
      <button
        key={item.id}
        onClick={() => setPage(item.id)}
        title={collapsed ? item.label : undefined}
        className={`relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150 ${
          collapsed ? 'justify-center px-0' : ''
        } ${
          active
            ? 'bg-primary-soft font-semibold text-primary'
            : 'text-text-2 hover:bg-surface-3/70 hover:text-text'
        }`}
      >
        {active && (
          <motion.span
            layoutId="nav-active-dot"
            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
          />
        )}
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    )
  }

  return (
    <nav
      className={`flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* 品牌区 */}
      <div className={`flex items-center gap-2.5 px-4 pb-2 pt-5 ${collapsed ? 'justify-center px-0' : ''}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-soft">
          <LayoutDashboard size={18} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[15px] font-bold tracking-wide text-text">MyDesk</p>
            <p className="text-[10px] text-text-3">个人数字工作台</p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={toggleCollapse}
            title="折叠侧边栏"
            className="rounded-lg p-1.5 text-text-3 transition-colors hover:bg-surface-3 hover:text-text"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggleCollapse}
          title="展开侧边栏"
          className="mx-auto mb-1 mt-1 rounded-lg p-1.5 text-text-3 transition-colors hover:bg-surface-3 hover:text-text"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* 快速新建（复用全局 QuickAdd） */}
      <div className={`px-3 py-2 ${collapsed ? 'px-2.5' : ''}`}>
        <button
          onClick={onQuickAdd}
          title={collapsed ? '快速添加' : undefined}
          className={`btn-primary flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-on-primary shadow-soft ${
            collapsed ? 'px-0' : 'px-3'
          }`}
        >
          <Plus size={16} className="shrink-0" />
          {!collapsed && <span>新建</span>}
        </button>
      </div>

      {/* 导航分组 */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 pt-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1.5">
            {!collapsed && (
              <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-text-3">
                {group.label}
              </p>
            )}
            {collapsed && <div className="mx-auto my-2 h-px w-8 bg-border" />}
            <div className="flex flex-col gap-0.5">{group.items.map(renderItem)}</div>
          </div>
        ))}

        {/* 最近访问（真实浏览记录，无记录时不显示） */}
        {!collapsed && recents.length > 0 && (
          <div className="mb-1.5">
            <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-text-3">
              最近访问
            </p>
            <div className="flex flex-col gap-0.5">
              {recents.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] text-text-3 transition-colors hover:bg-surface-3/70 hover:text-text"
                >
                  <History size={13} className="shrink-0" />
                  <span className="truncate">{PAGE_NAMES[p]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部：本地状态 + 设置 */}
      <div className="border-t border-border px-3 py-3">
        {!collapsed && (
          <p className="mb-1.5 flex items-center gap-1.5 px-3 text-[10px] leading-4 text-text-3">
            <ShieldCheck size={12} className="shrink-0 text-success" />
            本地优先 · 数据仅保存在本设备
          </p>
        )}
        <div className={collapsed ? 'flex justify-center' : ''}>
          {renderItem({ id: 'settings', label: '设置', icon: <SettingsIcon size={18} /> })}
        </div>
      </div>
    </nav>
  )
}
