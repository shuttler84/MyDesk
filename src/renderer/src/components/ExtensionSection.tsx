/**
 * 浏览器扩展连接设置（阶段三）：开关、令牌查看/复制/重置、使用指引。
 */
import { useEffect, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { api } from '../api/client'
import { useApp } from '../store/AppStore'
import { Button, Toggle } from './ui'

export function ExtensionSection() {
  const { toast } = useApp()
  const [status, setStatus] = useState<{ port: number; enabled: boolean; token: string } | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await api.extension.status())
    } catch (err) {
      toast('error', err instanceof Error ? err.message : '读取扩展状态失败')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!status) return <p className="text-xs text-text-3">加载中…</p>

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Toggle
          checked={status.enabled}
          onChange={async (v) => {
            try {
              await api.extension.setEnabled(v)
              await refresh()
              toast('success', v ? '浏览器扩展服务已启用' : '浏览器扩展服务已停用')
            } catch (err) {
              toast('error', err instanceof Error ? err.message : '设置失败')
            }
          }}
        />
        <span className="text-xs text-text-2">启用本地收藏服务</span>
        <span className="text-xs text-text-3">（127.0.0.1:{status.port}）</span>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-text">
          {status.token}
        </code>
        <Button
          className="!px-2 !py-1.5 text-xs"
          onClick={async () => {
            await window.mydesk.invoke('clipboard:write', { text: status.token })
            toast('success', '令牌已复制')
          }}
        >
          <Copy size={13} /> 复制
        </Button>
        <Button
          className="!px-2 !py-1.5 text-xs"
          onClick={async () => {
            if (!window.confirm('重置令牌后，浏览器扩展需要重新配置新令牌。确定重置吗？')) return
            try {
              await api.extension.resetToken()
              await refresh()
              toast('success', '令牌已重置，请在扩展选项中更新')
            } catch (err) {
              toast('error', err instanceof Error ? err.message : '重置失败')
            }
          }}
        >
          <RefreshCw size={13} /> 重置
        </Button>
      </div>

      <div className="rounded-xl bg-surface-2 px-4 py-3 text-xs leading-6 text-text-2">
        <p className="font-semibold text-text">使用方法：</p>
        <p>1. 打开 Chromium 内核浏览器（Chrome / Edge 等）→ 扩展管理 → 开启"开发者模式"。</p>
        <p>2. "加载已解压的扩展程序"，选择 MyDesk 安装目录下的 browser-extension 文件夹。</p>
        <p>3. 点击扩展图标 → 选项页 → 粘贴上方令牌并保存。</p>
        <p>4. 在任意网页点击扩展图标，填写备注与标签后保存，网页会直接进入 MyDesk 收藏。</p>
        <p className="mt-1 text-text-3">
          权限说明：扩展仅申请 tabs（读取当前标签页地址与标题）与 storage（本机保存令牌），全部数据只发送到本机
          MyDesk，不经过任何服务器。
        </p>
      </div>
    </div>
  )
}
