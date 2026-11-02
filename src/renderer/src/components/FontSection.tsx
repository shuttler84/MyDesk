/**
 * 字体设置区（外观个性化）：字体卡片选择器。
 * 每个选项的预览文字本身使用对应字体（fontFamily 内联），选中态高亮。
 * 切换即通过 patchSettings 持久化，全局立即生效（body 消费 --app-font）。
 */
import { Zap, BookOpen, Braces, PenLine, MonitorSmartphone } from 'lucide-react'
import type { AppSettings, FontFamilyId } from '@shared/types'
import { Button, Card } from './ui'

interface FontOption {
  id: FontFamilyId
  name: string
  /** 预览使用的 font-family（system 选项用默认栈） */
  cssFamily: string
  style: string
  desc: string
  license: string
}

const OPTIONS: FontOption[] = [
  {
    id: 'system',
    name: '系统默认字体',
    cssFamily:
      "'Inter', 'Segoe UI Variable', 'Segoe UI', system-ui, 'PingFang SC', 'Microsoft YaHei UI', sans-serif",
    style: '现代 · 均衡 · 原生',
    desc: '跟随 Windows 系统字体栈，轻量、无需加载字体文件。',
    license: ''
  },
  {
    id: 'source-han',
    name: '思源黑体 SC',
    cssFamily: "'Source Han Sans SC', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
    style: '现代 · 清晰 · 均衡',
    desc: '中英文显示稳定，适合长时间阅读和各种界面场景。',
    license: 'SIL OFL 1.0'
  },
  {
    id: 'sarasa',
    name: '更纱黑体 UI SC',
    cssFamily: "'Sarasa UI SC', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
    style: '理性 · 科技感 · 混排协调',
    desc: '中英文混排视觉统一，技术信息与数字表现出色。',
    license: 'SIL OFL 1.0'
  },
  {
    id: 'lxgw',
    name: '霞鹜文楷屏幕阅读版',
    cssFamily: "'LXGW WenKai Screen', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
    style: '温润 · 优雅 · 人文感',
    desc: '自然的手写风格，适合笔记与长文本阅读。',
    license: 'SIL OFL 1.0'
  }
]

const PREVIEW_CN = '你好，MyDesk！让每一次整理都更加简单。'
const PREVIEW_EN = 'English Typography — ABCDEFG 1234567890'
const PREVIEW_PUNCT = '，。、；：？！「」（）——……·'

export function FontSection({
  settings,
  patchSettings
}: {
  settings: AppSettings
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
}) {
  const current = OPTIONS.find((o) => o.id === settings.fontFamily)

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
        <Zap size={15} className="text-accent" /> 字体设置
      </h3>
      <p className="mb-3 text-xs text-text-3">
        当前字体：{current?.name ?? '系统默认字体'}（与主题相互独立，可自由组合；切换立即生效并持久化）
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {OPTIONS.map((o) => {
          const active = settings.fontFamily === o.id
          return (
            <button
              key={o.id}
              onClick={() => void patchSettings({ fontFamily: o.id })}
              className={`rounded-2xl border-2 p-3.5 text-left transition-all ${
                active
                  ? 'border-primary shadow-soft'
                  : 'border-border hover:border-border-strong hover:-translate-y-0.5'
              }`}
            >
              {/* 预览文字本身使用对应字体 */}
              <p
                className="text-base font-semibold text-text"
                style={{ fontFamily: o.cssFamily }}
              >
                {PREVIEW_CN}
              </p>
              <p
                className="mt-1 text-xs text-text-2"
                style={{ fontFamily: o.cssFamily }}
              >
                {PREVIEW_EN}
              </p>
              <p
                className="text-xs text-text-3"
                style={{ fontFamily: o.cssFamily }}
              >
                {PREVIEW_PUNCT}
              </p>
              <div className="mt-2.5 flex items-center gap-1.5 border-t border-border pt-2">
                <span className="text-sm font-semibold text-text">{o.name}</span>
                {active && (
                  <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    使用中
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-text-3">
                {o.style} · {o.desc}
              </p>
              {o.license && <p className="mt-0.5 text-[10px] text-text-3">授权：{o.license}</p>}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-text-3">
        <MonitorSmartphone size={13} className="mt-0.5 shrink-0" />
        <span>
          字体文件随应用打包并本地加载（不安装到系统、不依赖在线服务）；全局生效于所有页面、弹窗与控件。
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[11px] text-text-3">
        <span className="flex items-center gap-1">
          <BookOpen size={12} /> 思源黑体 / 霞鹜文楷：适合阅读
        </span>
        <span className="flex items-center gap-1">
          <Braces size={12} /> 更纱黑体：适合技术信息
        </span>
        <span className="flex items-center gap-1">
          <PenLine size={12} /> 与九种主题自由组合
        </span>
      </div>
    </Card>
  )
}
