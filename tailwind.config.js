/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: ['class', '[data-theme="midnight"]'],
  theme: {
    extend: {
      colors: {
        // 由 CSS 变量驱动的主题色（五种主题在 theme.css 中定义）
        page: 'rgb(var(--c-page) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--c-surface-3) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--c-border-strong) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        'text-2': 'rgb(var(--c-text-2) / <alpha-value>)',
        'text-3': 'rgb(var(--c-text-3) / <alpha-value>)',
        primary: 'rgb(var(--c-primary) / <alpha-value>)',
        'primary-soft': 'rgb(var(--c-primary-soft) / <alpha-value>)',
        'on-primary': 'rgb(var(--c-on-primary) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)'
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem'
      },
      boxShadow: {
        soft: '0 2px 12px -2px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.04)',
        lifted: '0 10px 30px -6px rgb(0 0 0 / 0.14), 0 4px 8px rgb(0 0 0 / 0.06)',
        modal: '0 24px 60px -12px rgb(0 0 0 / 0.28)'
      },
      fontFamily: {
        sans: [
          'Inter',
          'Segoe UI Variable',
          'Segoe UI',
          'system-ui',
          'PingFang SC',
          'Microsoft YaHei UI',
          'sans-serif'
        ],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'monospace']
      }
    }
  },
  plugins: []
}
