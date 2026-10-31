/**
 * MyDesk 主题注册表（单一事实来源）。
 * 新增主题的步骤：
 * 1. 在 THEME_REGISTRY 中添加条目（id/名称/预览色）。
 * 2. 在 src/renderer/src/theme/theme.css 中添加 `:root[data-theme='...']` 变量组。
 * 即可全应用生效（校验、设置、切换器自动包含）。
 */
import type { ThemeName } from './types'

export interface ThemeMeta {
  id: ThemeName
  /** 显示名（中文） */
  label: string
  /** 预览渐变（设置页/切换器色块） */
  swatch: string
}

export const THEME_REGISTRY: ThemeMeta[] = [
  { id: 'holographic', label: '全息', swatch: 'linear-gradient(135deg,#FF0080,#FF6B00,#FFD700,#00FF88,#00D4FF,#6366F1,#A855F7)' },
  { id: 'mint', label: '薄荷绿', swatch: 'linear-gradient(135deg,#40916c,#d6eee3)' },
  { id: 'lavender', label: '薰衣草', swatch: 'linear-gradient(135deg,#7a60aa,#e7dff4)' },
  { id: 'cream', label: '奶油白', swatch: 'linear-gradient(135deg,#ba7a42,#f5e3cd)' },
  { id: 'midnight', label: '深空暗色', swatch: 'linear-gradient(135deg,#1e2330,#60a5fa)' },
  { id: 'glass', label: '透明玻璃', swatch: 'linear-gradient(135deg,rgba(122,168,220,.75),rgba(176,148,220,.75))' }
]

export const THEME_IDS: ThemeName[] = THEME_REGISTRY.map((t) => t.id)

export function themeLabel(id: ThemeName): string {
  return THEME_REGISTRY.find((t) => t.id === id)?.label ?? id
}

export function themeSwatch(id: ThemeName): string {
  return THEME_REGISTRY.find((t) => t.id === id)?.swatch ?? ''
}
