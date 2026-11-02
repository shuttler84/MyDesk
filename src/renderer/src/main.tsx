import React from 'react'
import ReactDOM from 'react-dom/client'
import './theme/index.css'
import './theme/theme.css'
import './theme/fonts.css'
import './theme/loadFonts'
import App from './App'

// 启动防闪烁：主进程通过 URL 参数注入持久化的主题/字体（早于 React 渲染）
{
  const q = new URLSearchParams(window.location.search)
  const bootTheme = q.get('bootTheme')
  const bootFont = q.get('bootFont')
  const bootHeading = q.get('bootHeading')
  if (bootTheme) document.documentElement.dataset.theme = bootTheme
  if (bootFont) document.documentElement.dataset.font = bootFont
  if (bootHeading) document.documentElement.dataset.heading = bootHeading
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
