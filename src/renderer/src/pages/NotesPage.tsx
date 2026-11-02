/**
 * Notes 独立笔记：Markdown 编辑 + 实时预览、附件、分类、标签、搜索。
 */
import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Plus,
  Search,
  Trash2,
  Paperclip,
  Eye,
  PencilLine,
  Save,
  Link2,
  StickyNote
} from 'lucide-react'
import type { Note, NoteAttachment, NoteInput } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, EmptyState, Input, Modal, PageHeader, SkeletonList, Tag } from '../components/ui'

export function NotesPage() {
  const { toast, jumpTarget } = useApp()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setNotes(await api.notes.list({ search, category: category ?? undefined }))
      setCategories(await api.notes.categories())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载笔记失败')
    }
  }, [search, category, toast])

  useEffect(() => {
    setNotes(null)
    void load()
  }, [load])

  useEffect(() => {
    if (jumpTarget?.page === 'notes') void load()
  }, [jumpTarget, load])

  const createNote = async () => {
    try {
      const n = await api.notes.create({ title: '未命名笔记', content: '' })
      await load()
      setActiveId(n.id)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '创建笔记失败')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="笔记"
        description="用 Markdown 记录，支持附件、分类与标签。"
        actions={
          <Button variant="primary" onClick={() => void createNote()}>
            <Plus size={16} /> 新建笔记
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索笔记…" className="!w-56 !py-1.5 !pl-8" />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag active={category === null} onClick={() => setCategory(null)}>全部</Tag>
            {categories.map((c) => (
              <Tag key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Tag>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* 笔记列表 */}
        <div className="flex w-64 shrink-0 flex-col gap-1.5 overflow-y-auto pr-1">
          {notes === null ? (
            <SkeletonList rows={5} />
          ) : notes.length === 0 ? (
            <EmptyState icon={<StickyNote size={28} />} title="暂无笔记" hint="点击右上角「新建笔记」开始记录。" />
          ) : (
            <AnimatePresence initial={false}>
              {notes.map((n) => (
                <motion.button
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setActiveId(n.id)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    activeId === n.id
                      ? 'border-primary/50 bg-primary-soft/50'
                      : 'border-transparent hover:border-border hover:bg-surface-2'
                  }`}
                >
                  <p className="truncate text-sm font-medium text-text">{n.title || '（无标题）'}</p>
                  <p className="truncate text-xs text-text-3">
                    {n.content.replace(/[#*`>\-\[\]()!]/g, '').slice(0, 40) || '空笔记'}
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-text-3">
                    {n.updatedAt.slice(0, 10)}
                    {n.category ? ` · ${n.category}` : ''}
                    {n.tags.length ? ` · ${n.tags.join(', ')}` : ''}
                  </p>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* 编辑器 */}
        {activeId ? (
          <NoteEditor
            key={activeId}
            noteId={activeId}
            onChanged={load}
            onDeleted={() => setActiveId(null)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<PencilLine size={32} />}
              title="选择或新建一篇笔记"
              hint="笔记支持 Markdown、代码块、图片附件、分类和标签。"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- 编辑器 ----------

function NoteEditor({
  noteId,
  onChanged,
  onDeleted
}: {
  noteId: string
  onChanged: () => Promise<void>
  onDeleted: () => void
}) {
  const { toast } = useApp()
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [preview, setPreview] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [attachData, setAttachData] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const n = await api.notes.get(noteId)
        setNote(n)
        setTitle(n.title)
        setContent(n.content)
        setCategory(n.category)
        setTagsText(n.tags.join(', '))
        setAttachments(await api.notes.attachments(noteId))
        setDirty(false)
      } catch (err) {
        toast('error', err instanceof Error ? err.message : '加载笔记失败')
      }
    })()
  }, [noteId, toast])

  const save = async () => {
    setSaving(true)
    try {
      const tags = tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
      await api.notes.update(noteId, { title: title.trim() || '未命名笔记', content, category: category.trim(), tags })
      setDirty(false)
      toast('success', '笔记已保存')
      await onChanged()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存笔记失败')
    } finally {
      setSaving(false)
    }
  }

  const addAttachment = async () => {
    try {
      const a = await api.notes.addAttachment(noteId)
      if (!a) return
      setAttachments((prev) => [...prev, a])
      toast('success', `附件「${a.fileName}」已添加`)
      // 插入 Markdown 引用
      setContent((c) => `${c}\n\n![${a.fileName}](attachment:${a.id})\n`)
      setDirty(true)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '添加附件失败')
    }
  }

  const removeAttachment = async (a: NoteAttachment) => {
    try {
      await api.notes.removeAttachment(a.id)
      setAttachments((prev) => prev.filter((x) => x.id !== a.id))
      toast('success', '附件已移除')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '移除附件失败')
    }
  }

  const downloadAttachment = async (a: NoteAttachment) => {
    try {
      const res = await api.notes.saveAttachmentCopy(a.id)
      if (res) toast('success', `已保存到 ${res.path}`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存副本失败')
    }
  }

  const loadImage = async (id: string): Promise<string | null> => {
    if (attachData[id]) return attachData[id]
    try {
      const res = await api.notes.readAttachment(id)
      const url = `data:${res.mime};base64,${res.base64}`
      setAttachData((prev) => ({ ...prev, [id]: url }))
      return url
    } catch {
      return null
    }
  }

  if (!note) return <SkeletonList rows={3} />

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface-2/40">
      {/* 工具行 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Button variant={preview ? 'ghost' : 'secondary'} className="!px-2.5 !py-1.5 text-xs" onClick={() => setPreview(false)}>
          <PencilLine size={13} /> 编辑
        </Button>
        <Button variant={preview ? 'secondary' : 'ghost'} className="!px-2.5 !py-1.5 text-xs" onClick={() => setPreview(true)}>
          <Eye size={13} /> 预览
        </Button>
        <Button className="!px-2.5 !py-1.5 text-xs" onClick={() => void addAttachment()}>
          <Paperclip size={13} /> 附件
        </Button>
        <div className="flex-1" />
        {dirty && <span className="text-xs text-warning">未保存</span>}
        <Button variant="primary" className="!px-2.5 !py-1.5 text-xs" onClick={() => void save()} disabled={saving}>
          <Save size={13} /> 保存
        </Button>
        <Button variant="danger" className="!px-2.5 !py-1.5 text-xs" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={13} />
        </Button>
      </div>

      {/* 元数据行 */}
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2.5">
        <Input
          value={title}
          onChange={(v) => {
            setTitle(v)
            setDirty(true)
          }}
          placeholder="笔记标题"
          className="!w-64 font-semibold"
        />
        <Input
          value={category}
          onChange={(v) => {
            setCategory(v)
            setDirty(true)
          }}
          placeholder="分类"
          className="!w-36"
        />
        <Input
          value={tagsText}
          onChange={(v) => {
            setTagsText(v)
            setDirty(true)
          }}
          placeholder="标签（逗号分隔）"
          className="!w-56"
        />
      </div>

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
          {attachments.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-text-2">
              <Link2 size={11} />
              <button className="hover:text-primary" title="另存副本" onClick={() => void downloadAttachment(a)}>
                {a.fileName}
              </button>
              <span className="text-text-3">({Math.round(a.size / 1024)}KB)</span>
              <button className="text-text-3 hover:text-danger" title="移除" onClick={() => void removeAttachment(a)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 正文（舒适阅读宽度） */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {preview ? (
          <div className="md-body mx-auto max-w-3xl px-6 py-5">
            <MarkdownWithAttachments content={content} loadImage={loadImage} />
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
            placeholder={'# 标题\n\n用 **Markdown** 书写…\n\n```js\nconsole.log("支持代码块")\n```'}
            className="mx-auto block h-full min-h-[320px] w-full max-w-3xl resize-none bg-transparent px-6 py-5 font-mono text-sm leading-7 text-text outline-none"
          />
        )}
      </div>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="删除笔记？">
        <p className="mb-4 text-sm text-text-2">
          这将永久删除「{title || '这篇笔记'}」及其附件，且无法撤销。
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(false)}>取消</Button>
          <Button variant="danger" onClick={async () => {
            try {
              await api.notes.remove(noteId)
              setConfirmDelete(false)
              toast('success', '笔记已删除')
              await onChanged()
              onDeleted()
            } catch (err) {
              toast('error', err instanceof Error ? err.message : '删除失败')
            }
          }}>
            永久删除
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function MarkdownWithAttachments({
  content,
  loadImage
}: {
  content: string
  loadImage: (id: string) => Promise<string | null>
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        img({ src, alt }) {
          const s = typeof src === 'string' ? src : ''
          if (s.startsWith('attachment:')) {
            const id = s.slice('attachment:'.length)
            void loadImage(id).then((url) => {
              if (url) {
                const el = document.querySelector<HTMLImageElement>(`img[data-attach="${id}"]`)
                if (el && el.src !== url) el.src = url
              }
            })
            return <img data-attach={id} alt={alt ?? ''} className="my-2 max-w-full rounded-xl" />
          }
          if (/^https?:\/\//.test(s) || s.startsWith('data:')) {
            return <img src={s} alt={alt ?? ''} className="my-2 max-w-full rounded-xl" />
          }
          return <span className="text-xs text-text-3">[image: {alt ?? s}]</span>
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
