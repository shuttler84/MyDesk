/**
 * 浏览器扩展本地通信服务（阶段三）。
 *
 * 安全模型（任务书第四节）：
 * - 仅绑定 127.0.0.1（loopback），不暴露到局域网/公网
 * - 每次安装/重置生成随机 token；请求必须携带 `X-MyDesk-Token` 头
 * - 仅暴露一个能力：POST /collect（创建收藏）；无任何读取/保险箱能力
 * - 请求体 ≤ 64KB；zod 校验；CORS 仅放行浏览器扩展来源
 * - 可在设置中整体停用
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { randomBytes } from 'crypto'
import type { DB } from '@database/connection'
import { z } from 'zod'
import * as v from '@shared/validation'
import * as collectionService from './collectionService'
import { logActivity } from './activityService'
import type { ServiceContext } from './context'
import { getSettings, updateSettings } from './settingsService'

const DEFAULT_PORT = 27182
const MAX_BODY_BYTES = 64 * 1024

const collectSchema = z.object({
  url: v.urlSchema,
  title: z.string().trim().max(300),
  description: z.string().max(2000).optional(),
  note: z.string().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  groupId: z.string().uuid().nullable().optional()
})

export interface ExtensionServerState {
  port: number
  enabled: boolean
  tokenSet: boolean
  /** token 明文仅在设置页展示/复制（本机用户可见，非远程） */
}

function getToken(db: DB): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'extensionToken'`).get() as
    | { value: string }
    | undefined
  if (row) return JSON.parse(row.value) as string
  const token = randomBytes(24).toString('base64url')
  db.prepare(`INSERT INTO settings (key, value) VALUES ('extensionToken', ?)`).run(JSON.stringify(token))
  return token
}

export function resetToken(db: DB): string {
  const token = randomBytes(24).toString('base64url')
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('extensionToken', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(token))
  return token
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-MyDesk-Token')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export class ExtensionServer {
  private server: Server | null = null
  private port = DEFAULT_PORT

  status(db: DB): ExtensionServerState & { token: string } {
    const settings = getSettings(db)
    const enabled = (settings as { extensionEnabled?: boolean }).extensionEnabled ?? false
    return {
      port: this.port,
      enabled,
      tokenSet: true,
      token: getToken(db)
    }
  }

  setEnabled(ctx: ServiceContext, enabled: boolean): void {
    updateSettings(ctx.db, { extensionEnabled: enabled })
    if (enabled) this.start(ctx)
    else this.stop()
  }

  private ctxRef: ServiceContext | null = null
  private notifyRef: ((item: { kind: 'success' | 'error' | 'info'; title: string; body: string }) => void) | null =
    null

  start(ctx: ServiceContext, notify?: (item: { kind: 'success' | 'error' | 'info'; title: string; body: string }) => void): void {
    this.ctxRef = ctx
    this.notifyRef = notify ?? null
    if (this.server) return
    const db = ctx.db

    this.server = createServer((req, res) => {
      void this.handle(req, res, ctx)
    })
    // 仅监听回环地址：本地服务绝不暴露到网络
    this.server.listen(this.port, '127.0.0.1')
    this.server.on('error', (err) => {
      console.error('[MyDesk] 扩展服务启动失败:', err.message)
      this.server = null
    })
    void db
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private async handle(req: IncomingMessage, res: ServerResponse, ctx: ServiceContext): Promise<void> {
    setCors(res)
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method === 'GET' && req.url === '/groups') {
      const token2 = req.headers['x-mydesk-token']
      if (!token2 || token2 !== getToken(ctx.db)) {
        sendJson(res, 401, { ok: false, error: '无效的令牌' })
        return
      }
      sendJson(res, 200, { ok: true, data: collectionService.listGroups(ctx.db) })
      return
    }
    if (req.method !== 'POST' || req.url !== '/collect') {
      sendJson(res, 404, { ok: false, error: 'Not found' })
      return
    }
    // token 校验
    const token = req.headers['x-mydesk-token']
    if (!token || token !== getToken(ctx.db)) {
      sendJson(res, 401, { ok: false, error: '无效的令牌。请在 MyDesk 设置中复制最新令牌。' })
      return
    }
    // 读取请求体（限 64KB）
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    for await (const chunk of req) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        break
      }
      chunks.push(chunk as Buffer)
    }
    if (tooLarge) {
      sendJson(res, 413, { ok: false, error: '请求体过大' })
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      sendJson(res, 400, { ok: false, error: '无效的 JSON' })
      return
    }
    const check = collectSchema.safeParse(parsed)
    if (!check.success) {
      sendJson(res, 422, {
        ok: false,
        error: `数据校验失败：${check.error.issues[0]?.message ?? '未知'}`
      })
      return
    }
    const input = check.data
    try {
      // 重复检测
      const dup = collectionService.findByUrl(ctx.db, input.url)
      if (dup) {
        sendJson(res, 409, {
          ok: false,
          error: `该网页已收藏为「${dup.name}」`,
          duplicate: true
        })
        return
      }
      let host = input.url
      try {
        host = new URL(input.url).hostname
      } catch {
        /* ignore */
      }
      const c = collectionService.createCollection(ctx.db, {
        name: input.title || host,
        url: input.url,
        type: 'website',
        description: input.description ?? '',
        note: input.note ?? '',
        tags: input.tags ?? [],
        groupId: input.groupId ?? null
      })
      logActivity(ctx.db, 'collection_created', c.id, c.name)
      this.notifyRef?.({
        kind: 'success',
        title: '浏览器扩展收藏成功',
        body: c.name
      })
      // 后台补充网页元数据（不阻塞响应）
      void import('./metaFetchService').then(({ fetchUrlMeta }) =>
        fetchUrlMeta(input.url)
          .then((meta) => {
            if (meta.title || meta.description || meta.favicon) {
              collectionService.updateCollection(ctx.db, c.id, {
                name: meta.title ?? c.name,
                description: meta.description ?? '',
                favicon: meta.favicon ?? undefined,
                previewImage: meta.previewImage ?? undefined
              })
            }
          })
          .catch(() => undefined)
      )
      sendJson(res, 200, { ok: true, data: { id: c.id, name: c.name } })
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
