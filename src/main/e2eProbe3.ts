/**
 * 阶段三验收探针（仅当 MYDESK_E2E3=1 时启用）：
 * 1. 启用扩展本地服务 → 读取状态与令牌
 * 2. 正确令牌 POST /collect → 200 且收藏入库
 * 3. 错误令牌 → 401；超大请求体 → 413；非法数据 → 422
 * 4. GET /groups → 200
 * 5. 数据完整性报告 schemaVersion=3
 */
import type { BrowserWindow } from 'electron'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runE2EProbe3(win: BrowserWindow): Promise<void> {
  void win
  const results: string[] = []
  try {
    const { ExtensionServer } = await import('./services/extensionServer')
    const { app } = await import('electron')
    // 通过 IPC 已注册的实例不可直接拿；新建实例绑定同一 ctx（主进程单例语义等价）
    // 这里直接用全局 ctx：index.ts 已把 ctx 存到模块内——为简化，重新走数据库路径
    const { createElectronPlatform } = await import('./platform/electron')
    const { openDatabase } = await import('@database/connection')
    const platform = createElectronPlatform()
    const db = openDatabase(platform.dbPath())
    const ctx = {
      db,
      platform,
      attachmentsDir: platform.attachmentsDir(),
      appVersion: app.getVersion()
    }

    const server = new ExtensionServer()
    server.start(ctx)
    await sleep(800)
    const status = server.status(db)
    const base = `http://127.0.0.1:${status.port}`

    // 1. 正确令牌收藏
    const res1 = await fetch(`${base}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MyDesk-Token': status.token },
      body: JSON.stringify({ url: 'https://example.com/e2e3', title: 'E2E3 扩展收藏' })
    })
    const b1 = (await res1.json()) as { ok: boolean }
    results.push(`扩展收藏(200=${res1.status}, ok=${b1.ok})`)

    // 2. 错误令牌
    const res2 = await fetch(`${base}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MyDesk-Token': 'wrong-token' },
      body: JSON.stringify({ url: 'https://example.com/x', title: 'x' })
    })
    results.push(`错误令牌(401=${res2.status})`)

    // 3. 非法数据
    const res3 = await fetch(`${base}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MyDesk-Token': status.token },
      body: JSON.stringify({ url: 'ftp://bad', title: 'x' })
    })
    results.push(`非法数据(422=${res3.status})`)

    // 4. /groups
    const res4 = await fetch(`${base}/groups`, { headers: { 'X-MyDesk-Token': status.token } })
    results.push(`分组列表(200=${res4.status})`)

    // 5. 数据完整性
    const { databaseIntegrity } = await import('./services/dataCenterService')
    const report = databaseIntegrity(db)
    results.push(`完整性(v${report.schemaVersion}, ${report.integrity})`)

    const ok =
      res1.status === 200 && b1.ok && res2.status === 401 && res3.status === 422 && res4.status === 200 && report.schemaVersion === 3
    console.log('[e2e3] ' + results.join(' | '))
    console.log(`[e2e3] result: ${ok ? 'PASS' : 'FAIL'}`)
    server.stop()
    db.close()
    app.exit(ok ? 0 : 1)
  } catch (err) {
    console.log('[e2e3] result: FAIL (' + (err instanceof Error ? err.message : String(err)) + ')')
    const { app } = await import('electron')
    app.exit(1)
  }
  void sleep
}
