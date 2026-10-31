/**
 * 平台适配层接口 — 未来 Android 适配的预留接缝。
 * Windows 特定能力（路径、shell、剪贴板、对话框）只允许在这里出现，
 * 核心业务逻辑通过此接口调用，不直接依赖 Electron。
 */

export interface PlatformAdapter {
  /** 平台标识 */
  readonly name: string
  /** 应用数据目录（数据库、附件所在处） */
  dataDir(): string
  /** 数据库文件完整路径 */
  dbPath(): string
  /** 附件存储目录 */
  attachmentsDir(): string
  /** 使用系统默认应用打开外部链接（仅 http/https） */
  openExternal(url: string): Promise<void>
  /** 使用系统默认程序打开文件 */
  openPath(path: string): Promise<boolean>
  /** 在文件管理器中显示文件 */
  showItemInFolder(path: string): void
  /** 写入剪贴板（纯文本） */
  clipboardWriteText(text: string): void
  /** 读取剪贴板纯文本 */
  clipboardReadText(): Promise<string>
  /** 选择文件对话框（单个） */
  pickFile(options: { title?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
  /** 选择文件对话框（多个） */
  pickFiles(options: { title?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string[]>
  /** 保存文件对话框 */
  pickSaveFile(options: {
    title?: string
    defaultName?: string
    filters?: { name: string; extensions: string[] }[]
  }): Promise<string | null>
  /** 选择目录 */
  pickDirectory(options: { title?: string }): Promise<string | null>
}
