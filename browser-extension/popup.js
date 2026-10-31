// MyDesk 收藏助手 —— 弹出页逻辑（MV3 service worker 兼容）
const DEFAULT_SERVER = 'http://127.0.0.1:27182'

const $ = (id) => document.getElementById(id)

async function getConfig() {
  const cfg = await chrome.storage.local.get(['server', 'token'])
  return {
    server: cfg.server || DEFAULT_SERVER,
    token: cfg.token || ''
  }
}

function setStatus(text, ok) {
  const el = $('status')
  el.textContent = text
  el.className = ok ? 'ok' : 'err'
}

async function loadGroups() {
  const { server, token } = await getConfig()
  try {
    const res = await fetch(`${server}/groups`, {
      headers: { 'X-MyDesk-Token': token }
    })
    if (!res.ok) return
    const body = await res.json()
    if (body.ok && Array.isArray(body.data)) {
      for (const g of body.data) {
        const opt = document.createElement('option')
        opt.value = g.id
        opt.textContent = g.name
        $('group').appendChild(opt)
      }
    }
  } catch {
    /* 分组加载失败不阻塞收藏 */
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  $('title').value = tab?.title ?? ''
  $('url').textContent = tab?.url ?? ''
  $('description').value = ''
  // 描述由用户填写或 MyDesk 保存后自动抓取（避免额外 scripting 权限）
  await loadGroups()
}

$('save').addEventListener('click', async () => {
  const url = ($('url').textContent || '').trim()
  const title = $('title').value.trim()
  if (!/^https?:\/\//i.test(url)) {
    setStatus('只支持收藏 http/https 网页', false)
    return
  }
  const { server, token } = await getConfig()
  if (!token) {
    setStatus('未配置令牌，请先打开选项页配置', false)
    return
  }
  $('save').disabled = true
  setStatus('保存中…', true)
  try {
    const res = await fetch(`${server}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MyDesk-Token': token },
      body: JSON.stringify({
        url,
        title,
        description: $('description').value.trim(),
        note: $('note').value.trim(),
        tags: $('tags').value
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
        groupId: $('group').value || null
      })
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.ok) {
      setStatus('✓ 已收藏到 MyDesk', true)
      setTimeout(() => window.close(), 800)
    } else {
      setStatus(body.error ?? `保存失败（${res.status}）`, false)
    }
  } catch (err) {
    setStatus('无法连接 MyDesk，请确认应用正在运行', false)
  } finally {
    $('save').disabled = false
  }
})

void init
init()
