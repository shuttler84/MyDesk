/**
 * 网页元数据抓取（主进程内执行）。
 *
 * 安全约束：
 * - 仅允许 http/https。
 * - 响应体上限 2 MB，超限截断（防止内存耗尽）。
 * - 超时 8 秒。
 * - 抓取内容一律作为【纯数据】处理：只做字符串/正则解析，绝不 eval、
 *   绝不注入渲染进程执行，页面内容不会被当作程序指令。
 * - 解析失败的字段一律返回 null，由用户手动填写。
 */
import type { UrlMeta } from '@shared/types'

const FETCH_TIMEOUT_MS = 8000
const MAX_BODY_BYTES = 2 * 1024 * 1024

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re)
    if (m && m[1]) {
      const v = decodeEntities(m[1].trim())
      if (v) return v
    }
  }
  return null
}

function absoluteUrl(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString()
  } catch {
    return null
  }
}

export async function fetchUrlMeta(rawUrl: string): Promise<UrlMeta> {
  const meta: UrlMeta = {
    url: rawUrl,
    title: null,
    description: null,
    favicon: null,
    previewImage: null
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    meta.error = '无效的 URL'
    return meta
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    meta.error = '仅支持 http/https 链接'
    return meta
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let html = ''
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 MyDesk/1.0',
        Accept: 'text/html,application/xhtml+xml'
      }
    })
    if (!res.ok) {
      meta.error = `HTTP ${res.status}`
      return meta
    }
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_BODY_BYTES) {
      meta.error = '响应内容过大'
      return meta
    }
    const reader = res.body?.getReader()
    if (reader) {
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          total += value.byteLength
          if (total > MAX_BODY_BYTES) {
            void reader.cancel()
            break
          }
        }
      }
      const merged = new Uint8Array(Math.min(total, MAX_BODY_BYTES))
      let offset = 0
      for (const c of chunks) {
        if (offset + c.byteLength > merged.byteLength) {
          merged.set(c.subarray(0, merged.byteLength - offset), offset)
          break
        }
        merged.set(c, offset)
        offset += c.byteLength
      }
      html = new TextDecoder('utf-8', { fatal: false }).decode(merged)
    }
  } catch (err) {
    meta.error = err instanceof Error && err.name === 'AbortError' ? '请求超时' : '网络错误'
    return meta
  } finally {
    clearTimeout(timer)
  }

  if (!html) {
    meta.error = '响应内容为空'
    return meta
  }

  // GitHub 仓库识别：调用 GitHub 公共 API 获取仓库简介（仅作为数据使用）
  const gh = rawUrl.match(/^https?:\/\/(www\.)?github\.com\/([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)\/?/i)
  if (gh) {
    try {
      const api = await fetch(`https://api.github.com/repos/${gh[2]}/${gh[3].replace(/\.git$/, '')}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'MyDesk/1.1', Accept: 'application/vnd.github+json' }
      })
      if (api.ok) {
        const repo = (await api.json()) as { full_name?: string; description?: string; html_url?: string }
        if (repo.full_name) meta.title = repo.full_name
        if (repo.description) meta.description = repo.description
      }
      // API 失败不影响普通网页解析结果
    } catch {
      // 忽略：GitHub API 不可达时退回网页解析
    }
  }

  // ---- 以下全部是纯文本解析，内容仅作为数据使用 ----
  const titleFromTag = html.match(/<title[^>]*>([^<]{0,500})<\/title>/i)?.[1]
  meta.title =
    metaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']+)["']/i
    ]) ?? (titleFromTag ? decodeEntities(titleFromTag.trim()) : null)

  meta.description = metaContent(html, [
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i
  ])

  const iconRef = metaContent(html, [
    /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*icon[^"']*["']/i
  ])
  meta.favicon = iconRef
    ? absoluteUrl(decodeEntities(iconRef), parsed.toString())
    : absoluteUrl('/favicon.ico', parsed.origin)

  const previewRef = metaContent(html, [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i
  ])
  meta.previewImage = previewRef ? absoluteUrl(decodeEntities(previewRef), parsed.toString()) : null

  return meta
}
