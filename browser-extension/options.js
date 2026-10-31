const DEFAULT_SERVER = 'http://127.0.0.1:27182'
const $ = (id) => document.getElementById(id)

async function init() {
  const cfg = await chrome.storage.local.get(['server', 'token'])
  $('server').value = cfg.server || DEFAULT_SERVER
  $('token').value = cfg.token || ''
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    server: $('server').value.trim() || DEFAULT_SERVER,
    token: $('token').value.trim()
  })
  $('status').textContent = '✓ 已保存'
  setTimeout(() => ($('status').textContent = ''), 2000)
})

init()
