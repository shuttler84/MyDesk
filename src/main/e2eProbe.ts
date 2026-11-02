/**
 * 验收辅助：通过真实 UI 创建任务并验证（仅当 MYDESK_E2E=1 时由 index.ts 调用）。
 * 全链路验证：渲染层点击 → IPC → zod 校验 → 数据库持久化 → 列表回显。
 */
import type { BrowserWindow } from 'electron'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runE2EProbe(win: BrowserWindow): Promise<void> {
  const js = (code: string) => win.webContents.executeJavaScript(code)
  win.webContents.setBackgroundThrottling(false)
  win.restore()
  win.show()
  win.focus()
  await sleep(2500)

  // 1. 点击侧边栏「新建」（MyDesk 2.0 起新建入口在 Sidebar）
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='新建').click()`)
  await sleep(800)
  // 2. 填写任务标题（React 受控输入）
  await js(`
    (() => {
      const input = [...document.querySelectorAll('input')].find(i => i.placeholder?.includes('整理项目提案'))
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'E2E smoke task')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()
  `)
  await sleep(300)
  // 3. 提交
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='添加任务').click()`)
  await sleep(1200)
  // 4. 进入 Tasks 页验证回显
  await js(`[...document.querySelectorAll('nav button')].find(b=>b.textContent.trim()==='任务').click()`)
  await sleep(1500)
  const found: boolean = await js(`document.body.innerText.includes('E2E smoke task')`)
  console.log(`[e2e] task visible in UI: ${found}`)
  console.log(`[e2e] result: ${found ? 'PASS' : 'FAIL'}`)
  const { app } = await import('electron')
  app.exit(found ? 0 : 1)
}
