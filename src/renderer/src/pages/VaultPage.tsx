/**
 * Private Vault 私密保险箱（MyDesk 2.0）。
 * 三态：no_vault（首次设置主密码）→ locked（解锁）→ unlocked（条目管理）。
 * 密码/密钥默认隐藏，点击显示、一键复制（复制后主进程定时清空剪贴板）。
 * 锁定状态下任何模块都无法访问保险箱数据。安全逻辑与校验完全不变。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Lock,
  ShieldCheck,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Copy,
  KeyRound,
  Unlock,
  Search as SearchIcon
} from 'lucide-react'
import type { VaultItem, VaultItemInput, VaultStatus, VaultCategory } from '@shared/types'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonList,
  Tag,
  Textarea
} from '../components/ui'

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  website_account: '网站账号',
  developer_account: '开发者账号',
  api_keys: 'API 密钥 / 令牌',
  servers: '服务器',
  databases: '数据库',
  private_notes: '私密笔记'
}

export function VaultPage() {
  const { toast } = useApp()
  const [status, setStatus] = useState<VaultStatus | null>(null)
  const [items, setItems] = useState<VaultItem[] | null>(null)
  const [category, setCategory] = useState<'all' | VaultCategory>('all')
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<VaultItem | null>(null)
  const [pwModalOpen, setPwModalOpen] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.vault.status()
      setStatus(s)
      if (s.state === 'unlocked') setItems(await api.vault.list())
      else setItems(null)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '加载保险箱状态失败')
    }
  }, [toast])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const filtered = useMemo(() => {
    if (!items) return null
    let list = category === 'all' ? items : items.filter((i) => i.category === category)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.username.toLowerCase().includes(q) ||
          i.url.toLowerCase().includes(q)
      )
    }
    return list
  }, [items, category, search])

  const removeItem = async (item: VaultItem) => {
    try {
      await api.vault.remove(item.id)
      toast('success', '条目已删除')
      await loadStatus()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '删除条目失败')
    }
  }

  if (status === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <SkeletonList rows={3} />
      </div>
    )
  }

  // ---------- 首次设置 ----------
  if (status.state === 'no_vault') {
    return (
      <SetupView
        onDone={async () => {
          await loadStatus()
          toast('success', '保险箱已创建。请牢记：主密码丢失将无法恢复加密内容。')
        }}
      />
    )
  }

  // ---------- 锁定 ----------
  if (status.state === 'locked') {
    return (
      <LockedView
        status={status}
        onUnlocked={async () => {
          await loadStatus()
        }}
      />
    )
  }

  // ---------- 解锁 ----------
  const grouped = new Map<VaultCategory, VaultItem[]>()
  for (const item of filtered ?? []) {
    const list = grouped.get(item.category) ?? []
    list.push(item)
    grouped.set(item.category, list)
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="私密保险箱"
        description={`已解锁 · 闲置 ${status.autoLockMinutes} 分钟后自动锁定 · AES-256-GCM · Argon2id${
          status.kdf ? `（${status.kdf.memoryKiB / 1024} MiB / t=${status.kdf.iterations} / p=${status.kdf.parallelism}）` : ''
        }`}
        actions={
          <>
            <Button onClick={() => setPwModalOpen(true)}>
              <KeyRound size={15} /> 修改主密码
            </Button>
            <Button
              onClick={async () => {
                await api.vault.lock()
                toast('info', '保险箱已锁定')
                await loadStatus()
              }}
            >
              <Lock size={15} /> 立即锁定
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setEditorOpen(true)
              }}
            >
              <Plus size={16} /> 新建条目
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
          <Input value={search} onChange={setSearch} placeholder="搜索条目…" className="!w-56 !py-1.5 !pl-8" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag active={category === 'all'} onClick={() => setCategory('all')}>全部（{items?.length ?? 0}）</Tag>
          {(Object.keys(CATEGORY_LABELS) as VaultCategory[]).map((c) => {
            const count = items?.filter((i) => i.category === c).length ?? 0
            return (
              <Tag key={c} active={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_LABELS[c]}（{count}）
              </Tag>
            )
          })}
        </div>
      </div>

      {filtered === null ? (
        <SkeletonList rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={36} />}
          title={items && items.length > 0 ? '没有符合筛选条件的条目' : '保险箱是空的'}
          hint={
            items && items.length > 0
              ? '试试调整搜索关键词或分类筛选。'
              : '添加网站账号、API 密钥、服务器信息或私密笔记。所有内容都使用你的主密码加密（AES-256-GCM），程序本身也无法读取明文。'
          }
          action={
            <Button variant="primary" onClick={() => { setEditing(null); setEditorOpen(true) }}>
              <Plus size={16} /> 新建条目
            </Button>
          }
        />
      ) : (
        [...grouped.entries()].map(([cat, list]) => (
          <div key={cat}>
            <h3 className="font-heading mb-2 text-sm font-semibold tracking-wide text-text-2">
              {CATEGORY_LABELS[cat]} · {list.length}
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {list.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                  >
                    <VaultItemCard
                      item={item}
                      onEdit={() => {
                        setEditing(item)
                        setEditorOpen(true)
                      }}
                      onDelete={() => void removeItem(item)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ))
      )}

      <VaultEditorModal
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={async () => {
          setEditorOpen(false)
          await loadStatus()
        }}
      />
      <ChangePasswordModal open={pwModalOpen} onClose={() => setPwModalOpen(false)} onDone={loadStatus} />
    </div>
  )
}

// ---------- 设置视图 ----------

function SetupView({ onDone }: { onDone: () => Promise<void> }) {
  const { toast } = useApp()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (pw1.length < 8) {
      toast('error', '主密码至少需要 8 个字符')
      return
    }
    if (pw1 !== pw2) {
      toast('error', '两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      await api.vault.setup(pw1)
      await onDone()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '创建保险箱失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card className="p-7">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <ShieldCheck size={28} />
          </div>
          <h1 className="font-heading text-lg font-bold text-text">设置你的私密保险箱</h1>
          <p className="text-xs leading-5 text-text-3">
            设置一个独立的主密码。数据使用 Argon2id 派生密钥 + AES-256-GCM 加密，
            主密码不存储在任何地方。
            <br />
            <b className="text-danger">主密码一旦丢失，加密内容将无法找回。</b>
          </p>
        </div>
        <Field label="主密码（至少 8 位）">
          <Input type="password" value={pw1} onChange={setPw1} autoFocus />
        </Field>
        <Field label="确认主密码">
          <Input
            type="password"
            value={pw2}
            onChange={setPw2}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>
        <Button variant="primary" className="w-full" onClick={() => void submit()} disabled={busy || !pw1 || !pw2}>
          创建保险箱
        </Button>
      </Card>
    </div>
  )
}

function LockedView({ status, onUnlocked }: { status: VaultStatus; onUnlocked: () => Promise<void> }) {
  const { toast } = useApp()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await api.vault.unlock(pw)
      toast('success', '保险箱已解锁')
      setPw('')
      await onUnlocked()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '解锁失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card className="p-7">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-3 text-text-2">
            <Lock size={28} />
          </div>
          <h1 className="font-heading text-lg font-bold text-text">保险箱已锁定</h1>
          <p className="text-xs text-text-3">
            输入主密码解锁。闲置 {status.autoLockMinutes} 分钟后将自动锁定，剪贴板中的密钥也会被清空。
          </p>
        </div>
        <Field label="主密码">
          <Input
            type="password"
            value={pw}
            onChange={setPw}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </Field>
        <Button variant="primary" className="w-full" onClick={() => void submit()} disabled={busy || !pw}>
          <Unlock size={15} /> 解锁
        </Button>
      </Card>
    </div>
  )
}

// ---------- 条目卡片 ----------

function VaultItemCard({
  item,
  onEdit,
  onDelete
}: {
  item: VaultItem
  onEdit: () => void
  onDelete: () => void
}) {
  const { toast } = useApp()
  const [revealed, setRevealed] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  const reveal = async () => {
    if (revealed) {
      setRevealed(false)
      return
    }
    try {
      const res = await api.vault.revealSecret(item.id)
      setSecret(res.secret)
      setRevealed(true)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '获取明文失败')
    }
  }

  const copy = async () => {
    try {
      const res = await api.vault.copySecret(item.id)
      toast('success', `已复制，剪贴板将在 ${res.clearedAfterSeconds} 秒后自动清空`)
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '复制失败')
    }
  }

  return (
    <Card hover className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text">{item.name}</p>
          {item.username && <p className="truncate text-xs text-text-2">👤 {item.username}</p>}
          {item.url && <p className="truncate font-mono text-xs text-text-3">{item.url}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <MiniBtn title="编辑" onClick={onEdit}><Pencil size={13} /></MiniBtn>
          <MiniBtn title="删除" danger onClick={onDelete}><Trash2 size={13} /></MiniBtn>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-text">
          {revealed && secret !== null ? secret || '（空）' : '••••••••••'}
        </div>
        <MiniBtn title={revealed ? '隐藏' : '显示'} onClick={() => void reveal()}>
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </MiniBtn>
        <MiniBtn title="复制密钥" onClick={() => void copy()}><Copy size={14} /></MiniBtn>
      </div>
      {item.notes && <p className="mt-2 line-clamp-2 text-xs text-text-3">{item.notes}</p>}
    </Card>
  )
}

function MiniBtn({
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

// ---------- 条目编辑 ----------

function VaultEditorModal({
  open,
  editing,
  onClose,
  onSaved
}: {
  open: boolean
  editing: VaultItem | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { toast } = useApp()
  const [form, setForm] = useState<VaultItemInput>({ name: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        name: editing.name,
        username: editing.username,
        secret: editing.secret,
        url: editing.url,
        notes: editing.notes,
        category: editing.category
      })
    } else {
      setForm({ name: '', username: '', secret: '', url: '', notes: '', category: 'website_account' })
    }
  }, [open, editing])

  const submit = async () => {
    if (!form.name.trim()) return
    setBusy(true)
    try {
      if (editing) {
        await api.vault.update(editing.id, form)
        toast('success', '条目已更新')
      } else {
        await api.vault.create(form)
        toast('success', '条目已加入保险箱')
      }
      await onSaved()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '保存条目失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? '编辑条目' : '新建条目'} wide>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="名称 *">
          <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} autoFocus />
        </Field>
        <Field label="分类">
          <Select
            value={form.category ?? 'website_account'}
            onChange={(v) => setForm((f) => ({ ...f, category: v as VaultCategory }))}
            options={(Object.keys(CATEGORY_LABELS) as VaultCategory[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
          />
        </Field>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="账号 / 用户名">
          <Input value={form.username ?? ''} onChange={(v) => setForm((f) => ({ ...f, username: v }))} />
        </Field>
        <Field label="URL">
          <Input value={form.url ?? ''} onChange={(v) => setForm((f) => ({ ...f, url: v }))} placeholder="https://…" mono />
        </Field>
      </div>
      <Field label="密码 / API 密钥 / 密钥">
        <Textarea
          mono
          value={form.secret ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, secret: v }))}
          rows={2}
          placeholder="加密存储（AES-256-GCM）"
        />
      </Field>
      <Field label="备注">
        <Textarea value={form.notes ?? ''} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} rows={2} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={!form.name.trim() || busy}>
          {editing ? '保存修改' : '添加条目'}
        </Button>
      </div>
    </Modal>
  )
}

// ---------- 修改主密码 ----------

function ChangePasswordModal({
  open,
  onClose,
  onDone
}: {
  open: boolean
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { toast } = useApp()
  const [cur, setCur] = useState('')
  const [nw1, setNw1] = useState('')
  const [nw2, setNw2] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (nw1.length < 8) {
      toast('error', '新密码至少需要 8 个字符')
      return
    }
    if (nw1 !== nw2) {
      toast('error', '两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      await api.vault.changePassword(cur, nw1)
      toast('success', '主密码已修改，全部数据已用新密钥重新加密。')
      onClose()
      setCur('')
      setNw1('')
      setNw2('')
      await onDone()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '修改主密码失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="修改主密码">
      <Field label="当前主密码">
        <Input type="password" value={cur} onChange={setCur} autoFocus />
      </Field>
      <Field label="新主密码（至少 8 位）">
        <Input type="password" value={nw1} onChange={setNw1} />
      </Field>
      <Field label="确认新密码">
        <Input type="password" value={nw2} onChange={setNw2} />
      </Field>
      <p className="mb-4 text-xs text-text-3">
        整个保险箱将使用新派生的密钥重新加密（密钥轮换）。此操作无法找回已忘记的密码。
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy || !cur || !nw1 || !nw2}>
          轮换密钥并保存
        </Button>
      </div>
    </Modal>
  )
}
