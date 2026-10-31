/**
 * Windows / Electron 平台适配实现。
 * 这是唯一允许 import 'electron' 的业务侧模块之一。
 */
import { app, shell, clipboard, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { PlatformAdapter } from './types'

export function createElectronPlatform(): PlatformAdapter {
  return {
    name: `electron (${process.platform})`,

    dataDir() {
      return app.getPath('userData')
    },

    dbPath() {
      return join(app.getPath('userData'), 'mydesk.db')
    },

    attachmentsDir() {
      const dir = join(app.getPath('userData'), 'attachments')
      mkdirSync(dir, { recursive: true })
      return dir
    },

    async openExternal(url) {
      if (!/^https?:\/\//i.test(url)) throw new Error('refused to open non-http(s) URL')
      await shell.openExternal(url)
    },

    async openPath(path) {
      const result = await shell.openPath(path)
      return result === ''
    },

    showItemInFolder(path) {
      shell.showItemInFolder(path)
    },

    clipboardWriteText(text) {
      clipboard.writeText(text)
    },

    clipboardReadText() {
      return clipboard.readText()
    },

    async pickFile(options) {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = await dialog.showOpenDialog(win as BrowserWindow, {
        title: options.title ?? '选择文件',
        properties: ['openFile'],
        filters: options.filters
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },

    async pickFiles(options) {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = await dialog.showOpenDialog(win as BrowserWindow, {
        title: options.title ?? '选择文件',
        properties: ['openFile', 'multiSelections'],
        filters: options.filters
      })
      return result.canceled ? [] : result.filePaths
    },

    async pickSaveFile(options) {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = await dialog.showSaveDialog(win as BrowserWindow, {
        title: options.title ?? '保存文件',
        defaultPath: options.defaultName,
        filters: options.filters
      })
      return result.canceled || !result.filePath ? null : result.filePath
    },

    async pickDirectory(options) {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = await dialog.showOpenDialog(win as BrowserWindow, {
        title: options.title ?? '选择文件夹',
        properties: ['openDirectory']
      })
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    }
  }
}
