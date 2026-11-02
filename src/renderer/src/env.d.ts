/// <reference types="vite/client" />

declare module '*.otf' {
  const src: string
  export default src
}
declare module '*.ttf' {
  const src: string
  export default src
}

import type { MyDeskApi } from '../../preload/index'

declare global {
  interface Window {
    mydesk: MyDeskApi
  }
}

export {}
