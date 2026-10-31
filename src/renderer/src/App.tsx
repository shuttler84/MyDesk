import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppProvider, useApp } from './store/AppStore'
import { Sidebar } from './layout/Sidebar'
import { Topbar } from './layout/Topbar'
import { DashboardPage } from './pages/DashboardPage'
import { TasksPage } from './pages/TasksPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { VaultPage } from './pages/VaultPage'
import { FileIndexPage } from './pages/FileIndexPage'
import { NotesPage } from './pages/NotesPage'
import { TimelinePage } from './pages/TimelinePage'
import { SettingsPage } from './pages/SettingsPage'
import { QuickAddModal } from './components/QuickAddModal'
import { QuickAddWindow } from './QuickAddWindow'
import type { PageId } from '@shared/types'

const PAGES: Record<PageId, React.ComponentType> = {
  dashboard: DashboardPage,
  tasks: TasksPage,
  collections: CollectionsPage,
  vault: VaultPage,
  files: FileIndexPage,
  notes: NotesPage,
  timeline: TimelinePage,
  settings: SettingsPage
}

function Shell() {
  const { page } = useApp()
  const [quickAdd, setQuickAdd] = useState(false)
  const Page = PAGES[page]

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onQuickAdd={() => setQuickAdd(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="mx-auto max-w-6xl px-6 py-6"
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <QuickAddModal open={quickAdd} onClose={() => setQuickAdd(false)} />
    </div>
  )
}

export default function App() {
  // 快速添加独立窗口：主进程以 ?window=quickadd 加载同一渲染入口
  if (new URLSearchParams(window.location.search).get('window') === 'quickadd') {
    return <QuickAddWindow />
  }
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
