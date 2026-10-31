/**
 * 顶栏"快速添加"：快速创建今日任务。
 */
import { useState } from 'react'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Field, Input, Modal } from './ui'

export function QuickAddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useApp()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const t = title.trim()
    if (!t) return
    setBusy(true)
    try {
      const today = localToday()
      await api.tasks.create({ title: t, dueDate: today })
      toast('success', '已添加到今日任务')
      setTitle('')
      onClose()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '添加任务失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="快速添加任务">
      <Field label="任务标题">
        <Input
          autoFocus
          value={title}
          onChange={setTitle}
          placeholder="例如：整理项目提案"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </Field>
      <p className="mb-4 text-xs text-text-3">任务将添加到「今天」视图，截止日期自动设为今天。</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={!title.trim() || busy}>
          添加任务
        </Button>
      </div>
    </Modal>
  )
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
