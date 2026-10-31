/**
 * 全局快速添加 — 输入类型识别器（平台无关，可测试）。
 *
 * 识别规则（按优先级）：
 * 1. 以 http(s):// 开头且为合法 URL：
 *    - github.com/{owner}/{repo} → GitHub 收藏
 *    - 其他 → 网站收藏
 * 2. 文件路径形态（盘符/UNC/多段路径）→ 文件索引（保存时校验存在性）
 * 3. 其他文本 → 任务（用户可手动改为笔记）
 *
 * 识别失败时一律回退为"文本"，由用户手动选择类型。
 */
import type { QuickAddParse, QuickAddKind } from './types'

const GITHUB_REPO_RE = /^https?:\/\/(www\.)?github\.com\/([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+)\/?(\?.*)?(#.*)?$/

function looksLikePath(text: string): boolean {
  // Windows 盘符路径、UNC 路径、以 \ 或 / 分隔的多段路径
  if (/^[a-zA-Z]:[\\/].+/.test(text)) return true
  if (/^\\\\[^\\]+\\.+/.test(text)) return true
  if (/[\\/]/.test(text) && text.length > 3 && !text.includes('://')) return true
  return false
}

export function parseQuickAddInput(raw: string): QuickAddParse {
  const text = raw.trim()

  // 1. URL
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text)
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const gh = text.match(GITHUB_REPO_RE)
        if (gh) {
          return {
            kind: 'github',
            value: text,
            hint: `识别为 GitHub 仓库：${gh[2]}/${gh[3].replace(/\.git$/, '')}`
          }
        }
        return { kind: 'url', value: text, hint: '识别为网站链接，将收藏该网页' }
      }
    } catch {
      // 非 URL，继续
    }
  }

  // 2. 本地文件路径（形态启发式：盘符 / UNC / 多段路径；保存时再校验存在性）
  //    注意：识别器同时用于渲染进程，不能依赖 Node fs。
  if (text.length <= 260 && looksLikePath(text)) {
    return { kind: 'file', value: text, hint: '识别为本机文件路径，将加入文件索引' }
  }

  // 3. 普通文本 → 任务
  return {
    kind: 'task',
    value: text,
    hint: '识别为文本，可创建任务或改为笔记'
  }
}

/** 快速添加的展示标签 */
export function quickAddKindLabel(kind: QuickAddKind): string {
  switch (kind) {
    case 'task':
      return '任务'
    case 'note':
      return '笔记'
    case 'url':
      return '网站收藏'
    case 'github':
      return 'GitHub 收藏'
    case 'file':
      return '文件索引'
  }
}
