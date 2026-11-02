/**
 * 字体注册：通过 vite 资源管道 import 字体文件（构建时 emit 到 assets），
 * 再以 @font-face 注入。相比 CSS url() 引用，该方式在构建期可 100% 解析。
 */
import sarasaBold from '../assets/fonts/sarasa-ui-sc-bold.ttf'
import sarasaRegular from '../assets/fonts/sarasa-ui-sc-regular.ttf'
import sourceHanBold from '../assets/fonts/SourceHanSansCN-Bold.otf'
import sourceHanRegular from '../assets/fonts/SourceHanSansCN-Regular.otf'
import sourceSerifBold from '../assets/fonts/SourceHanSerifCN-Bold.otf'
import sourceSerifRegular from '../assets/fonts/SourceHanSerifCN-Regular.otf'
import lxgwScreen from '../assets/fonts/LXGWWenKaiScreen.ttf'

let injected = false

export function injectFontFaces(): void {
  if (injected) return
  injected = true
  const css = `
@font-face { font-family: 'Source Han Sans SC'; src: url('${sourceHanRegular}') format('opentype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Source Han Sans SC'; src: url('${sourceHanBold}') format('opentype'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Source Han Serif CN'; src: url('${sourceSerifRegular}') format('opentype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Source Han Serif CN'; src: url('${sourceSerifBold}') format('opentype'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'Sarasa UI SC'; src: url('${sarasaRegular}') format('truetype'); font-weight: 400; font-display: swap; }
@font-face { font-family: 'Sarasa UI SC'; src: url('${sarasaBold}') format('truetype'); font-weight: 700; font-display: swap; }
@font-face { font-family: 'LXGW WenKai Screen'; src: url('${lxgwScreen}') format('truetype'); font-weight: 400; font-display: swap; }
`
  const style = document.createElement('style')
  style.dataset.fontFaces = '1'
  style.textContent = css
  document.head.appendChild(style)
}

injectFontFaces()
