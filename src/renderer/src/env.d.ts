/// <reference types="vite/client" />

import type { MyDeskApi } from '../../preload/index'

declare global {
  interface Window {
    mydesk: MyDeskApi
  }
}

export {}
