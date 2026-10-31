/**
 * 开发/验收辅助：自动遍历各页面并截图（仅当设置了 MYDESK_UI_TOUR 环境变量时启用）。
 * 走真实用户路径：点击导航与 Settings 页主题按钮，验证应用自身的状态切换。
 */
import type { BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const PAGES = [
  '首页',
  '任务',
  '收藏',
  '保险箱',
  '文件索引',
  '笔记',
  '时间轴',
  '设置'
]

const THEMES: Array<{ id: string; label: string }> = [
  { id: 'mint', label: '薄荷绿' },
  { id: 'lavender', label: '薰衣草' },
  { id: 'cream', label: '奶油白' },
  { id: 'midnight', label: '深空暗色' },
  { id: 'glass', label: '透明玻璃' }
]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runUiTour(win: BrowserWindow): Promise<void> {
  const outDir = process.env.MYDESK_UI_TOUR
  if (!outDir) return
  await sleep(3000) // 等待首屏数据加载
  mkdirSync(outDir, { recursive: true })

  // 可用 MYDESK_UI_PAGES="页面1|页面2" 限定页面，MYDESK_UI_THEME 限定单一主题
  const onlyPages = process.env.MYDESK_UI_PAGES ? process.env.MYDESK_UI_PAGES.split('|') : null
  const onlyTheme = process.env.MYDESK_UI_THEME ?? null
  const pages = onlyPages ? PAGES.filter((p) => onlyPages.includes(p)) : PAGES
  const themes = onlyTheme ? THEMES.filter((t) => t.id === onlyTheme) : THEMES

  // 确保窗口真实可见：被遮挡/最小化时 rAF 冻结，动画停在初始帧导致截图空白
  win.webContents.setBackgroundThrottling(false)
  win.setAlwaysOnTop(true, 'screen-saver')
  win.restore()
  win.show()
  win.focus()
  await sleep(800)

  const clickNav = (label: string) =>
    win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('nav button')]
        const b = btns.find((x) => x.textContent.trim() === '${label}')
        if (b) b.click()
        return !!b
      })()
    `)

  for (const theme of themes) {
    // 进入 Settings，点击主题按钮（真实 UI 路径，触发 React 状态与持久化）
    await clickNav('设置')
    await sleep(1000)
    const clicked = await win.webContents.executeJavaScript(`
      (() => {
        const btns = [...document.querySelectorAll('button')]
        const b = btns.find((x) => x.textContent.includes('${theme.label}'))
        if (b) b.click()
        return !!b
      })()
    `)
    await sleep(1500)
    const applied = await win.webContents.executeJavaScript(
      `document.documentElement.dataset.theme`
    )
    console.log(`[ui-tour] theme ${theme.id}: clicked=${clicked} applied=${applied}`)

    for (const page of pages) {
      await clickNav(page)
      // 轮询等待导航激活态与目标页一致（动画/渲染完成后才截图）
      let ok = false
      for (let i = 0; i < 12; i++) {
        await sleep(400)
        const active = await win.webContents.executeJavaScript(`
          (() => {
            const b = [...document.querySelectorAll('nav button')].find(
              (x) => x.className.includes('bg-primary-soft')
            )
            return b ? b.textContent.trim() : ''
          })()
        `)
        if (active === page) {
          ok = true
          break
        }
      }
      await sleep(page === '设置' ? 2000 : 700) // 等待过渡动画完全结束
      const image = await win.webContents.capturePage()
      writeFileSync(join(outDir, `${theme.id}-${page.replace(/\s+/g, '')}.png`), image.toPNG())
      // 长页面补充底部截图（如设置页的备份中心）
      const scrolled = await win.webContents.executeJavaScript(
        `(() => { const m = document.querySelector('main'); if (!m) return false; m.scrollTop = m.scrollHeight; return m.scrollHeight > m.clientHeight })()`
      )
      if (scrolled) {
        await sleep(900)
        const bottom = await win.webContents.capturePage()
        writeFileSync(join(outDir, `${theme.id}-${page.replace(/\s+/g, '')}-bottom.png`), bottom.toPNG())
        await win.webContents.executeJavaScript(
          `(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; return true })()`
        )
        await sleep(400)
      }
      if (!ok) console.log(`[ui-tour] warning: ${theme.id}/${page} active state not confirmed`)
    }
    console.log(`[ui-tour] ${theme.id} pages captured`)
  }

  // 收尾：恢复默认主题与 Dashboard
  await clickNav('设置')
  await sleep(600)
  await win.webContents.executeJavaScript(`
    (() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('薄荷绿'))
      if (b) b.click()
    })()
  `)
  await sleep(600)
  await clickNav('首页')
  console.log('[ui-tour] done')
}
