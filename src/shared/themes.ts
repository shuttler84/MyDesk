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
  /** 设置页迷你组件预览用的核心色（页面/卡片/文字/主色） */
  preview: { page: string; card: string; text: string; primary: string }
}

export const THEME_REGISTRY: ThemeMeta[] = [
  {
    id: 'claude',
    label: 'Claude 暖砂',
    swatch: 'linear-gradient(135deg,#FAF9F5 20%,#EFE9DE 45%,#CC785C 75%,#A9583E)',
    preview: { page: '#FAF9F5', card: '#EFE9DE', text: '#141413', primary: '#CC785C' }
  },
  {
    id: 'holographic',
    label: '全息',
    swatch: 'linear-gradient(135deg,#FF0080,#FF6B00,#FFD700,#00FF88,#00D4FF,#6366F1,#A855F7)',
    preview: { page: '#0A0A1F', card: '#1E1834', text: '#EEECFA', primary: '#A855F7' }
  },
  {
    id: 'acid',
    label: '酸性',
    swatch: 'linear-gradient(135deg,#0a0a0a 30%,#39FF14 55%,#E6FF00 75%,#A020F0)',
    preview: { page: '#0A0A0A', card: '#151515', text: '#F5F5F5', primary: '#39FF14' }
  },
  {
    id: 'neo',
    label: '野兽派',
    swatch: 'linear-gradient(135deg,#FF6B6B 25%,#FFE66D 50%,#4ECDC4 75%,#95E1D3)',
    preview: { page: '#FFFFFF', card: '#FFFDF8', text: '#111111', primary: '#FF6B6B' }
  },
  {
    id: 'mint',
    label: '薄荷绿',
    swatch: 'linear-gradient(135deg,#40916c,#d6eee3)',
    preview: { page: '#F2F8F6', card: '#FFFFFF', text: '#26322E', primary: '#40916C' }
  },
  {
    id: 'lavender',
    label: '薰衣草',
    swatch: 'linear-gradient(135deg,#7a60aa,#e7dff4)',
    preview: { page: '#F6F3FA', card: '#FFFFFF', text: '#302A3A', primary: '#7A60AA' }
  },
  {
    id: 'cream',
    label: '奶油白',
    swatch: 'linear-gradient(135deg,#ba7a42,#f5e3cd)',
    preview: { page: '#FAF6EF', card: '#FFFDF9', text: '#3E362A', primary: '#BA7A42' }
  },
  {
    id: 'midnight',
    label: '深空暗色',
    swatch: 'linear-gradient(135deg,#1e2330,#60a5fa)',
    preview: { page: '#161A22', card: '#202530', text: '#E2E7EE', primary: '#60A5FA' }
  },
  {
    id: 'glass',
    label: '透明玻璃',
    swatch: 'linear-gradient(135deg,rgba(122,168,220,.75),rgba(176,148,220,.75))',
    preview: { page: '#E9F0F6', card: '#FFFFFF', text: '#222C36', primary: '#4682B4' }
  }
]

export const THEME_IDS: ThemeName[] = THEME_REGISTRY.map((t) => t.id)

export function themeLabel(id: ThemeName): string {
  return THEME_REGISTRY.find((t) => t.id === id)?.label ?? id
}

export function themeSwatch(id: ThemeName): string {
  return THEME_REGISTRY.find((t) => t.id === id)?.swatch ?? ''
}
