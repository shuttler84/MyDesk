# MyDesk Android 适配架构文档（路线图）

> 状态：阶段三完成时的架构检查记录。当前仍以 Windows（Electron）为唯一交付平台；本文档描述未来 Android 端的适配设计与技术方案评估。

## 1. 架构现状评估（阶段三检查结论）

### 1.1 业务逻辑与 Electron 解耦 ✅ 已达标

以下核心逻辑全部位于平台无关层，可直接在 Node/移动端复用：

| 逻辑 | 位置 | Electron 依赖 |
| --- | --- | --- |
| 任务管理 | `src/main/services/taskService.ts` | 无 |
| 收藏管理（含分组/历史/统计） | `src/main/services/collectionService.ts` | 无 |
| 笔记管理 | `src/main/services/noteService.ts` | 无（附件 fs 操作为 Node API） |
| 文件索引 | `src/main/services/fileIndexService.ts` | 无（fs 仅读元信息） |
| 数据模型 | `src/shared/types.ts` | 无 |
| 数据校验 | `src/shared/validation.ts`（zod） | 无 |
| 数据导入导出 | `src/main/services/exportService.ts` | 无 |
| 备份/恢复 | `src/main/services/backupService.ts`（ZIP+SQLite） | 无（adm-zip/node:sqlite） |
| Schema 迁移 | `src/database/*` | 无 |
| 加密（Argon2id + AES-256-GCM） | `src/main/services/vaultService.ts`（hash-wasm + node crypto） | 无（hash-wasm 为 WASM） |
| 统计/时间轴 | `src/main/services/timelineService.ts`、`src/shared/reminder.ts` | 无 |
| 快速添加识别器 | `src/shared/quickAdd.ts` | 无 |

**测试即证明**：`tests/` 全部 59 个用例在纯 Node 环境运行服务层，无 Electron。

### 1.2 平台适配层 ✅ 已封装

Windows 特定能力集中在 `src/main/platform/`（`PlatformAdapter` 接口 + Electron 实现）：

| 能力 | 接口方法 | Android 对应方案 |
| --- | --- | --- |
| 文件系统路径 | `dataDir/dbPath/attachmentsDir` | 应用私有目录 / SAF |
| 外链打开 | `openExternal` | Intent |
| 文件打开/定位 | `openPath/showItemInFolder` | Intent / DocumentsUI |
| 剪贴板 | `clipboardWriteText/ReadText` | ClipboardManager |
| 文件选择 | `pickFile/pickFiles/pickSaveFile/pickDirectory` | SAF / 文件选择器 |
| 系统托盘 | `src/main/tray.ts`（Electron 专属） | 前台服务 + 常驻通知 |
| 全局快捷键 | `src/main/quickAdd.ts`（globalShortcut） | 快捷磁贴 / 分享目标 |
| 桌面通知 | `src/main/notificationCenter.ts`（Notification） | NotificationManager（含勿扰由应用层实现） |
| 开机启动 | `app.setLoginItemSettings` | `RECEIVE_BOOT_COMPLETED` |

## 2. 数据跨平台设计

- **数据模型/备份格式/加密格式**：均平台无关。备份为 ZIP+JSON+SQLite；加密容器含算法与参数元数据（`VAULT_FORMAT_VERSION`、KDF 参数）。
- **文件路径**：`file_index.origin_device`（V3 新增）标记路径来源设备。Windows 绝对路径仅在本机有效——迁移到其他设备后这些记录作为"原设备历史索引"保留（`is_invalid` 标记 + 允许更新路径重新映射），**绝不把 Windows 绝对路径当作跨平台文件标识**。
- **附件**：磁盘文件名为随机 UUID（`note_attachments.stored_name`），引用关系在数据库中，目录结构可整体迁移；原始文件名独立保存。
- **UUID 主键**：所有业务实体使用 UUID，跨设备合并不会冲突（当前合并导入仍未提供，见 DATA_FORMAT.md）。

## 3. 移动端 UI 适配设计（预研）

- **导航**：左侧固定栏在窄屏切换为底部标签栏（5 项）+ "更多"抽屉（Sidebar 组件已模块化，可替换实现）。
- **卡片/列表**：现有布局基于 Tailwind 断点（md/xl），窄屏已单列；卡片内操作按钮在触摸端改为长按菜单。
- **笔记编辑**：编辑/预览双 Tab 已适配窄屏；Markdown 工具条需增加移动端常用操作。
- **弹窗**：现有 Modal max-w-md/2xl，窄屏自动全宽；需增加底部抽屉样式变体。
- **保险箱解锁**：解锁界面为独立卡片布局，天然适配竖屏；预留生物识别按钮位（见 §4）。
- **触摸目标**：现有按钮/图标最小 36px，符合触控规范；拖拽排序在移动端需补充上移/下移按钮备选。

## 4. 移动端数据安全设计（预研）

- **系统安全存储**：主密码的"记住解锁会话"可用 Android Keystore 硬件-backed 密钥加密一个随机会话密钥（等效桌面端"启动时解锁"体验，主密码仍不可绕过）。
- **生物识别**：`BiometricPrompt` 解锁 Keystore 密钥 → 解密会话密钥 → 解锁保险箱容器（加密格式不变，仅密钥保管方式变化）。
- **本地加密数据库**：移动端可直接复用 `vaultService` 的整容器加密模式；SQLite 文件建议叠加 SQLCipher（与桌面保持逻辑等效：容器层加密已足够，SQLCipher 为可选纵深防御）。
- **加密备份恢复**：`.mydeskpack` 格式完全跨平台；移动端恢复后用主密码解锁，密钥派生参数随包元数据携带。

## 5. 技术方案评估

| 方案 | 结论 |
| --- | --- |
| **Capacitor**（推荐） | 将现有 React 渲染层直接打包为 WebView 应用；业务逻辑通过 Capacitor 插件桥接到原生 SQLite/通知/生物识别。复用度最高（UI + shared + services 全部复用），改动集中在 PlatformAdapter 的 Android 实现与拖拽等触摸交互。 |
| React Native | 需要重写全部 UI（Tailwind/Framer Motion 不适用），仅 shared 层可复用，成本高。 |
| KMP + 原生 UI | 长期体验最佳但成本最高，不适合当前阶段。 |

**结论**：未来 Android 端采用 **Capacitor + 复用 React 渲染层 + PlatformAdapter-Android** 方案。当前代码结构已满足该路径的前置条件，无需迁移现有项目。

## 6. 阶段性结论

- 桌面与移动端共享：数据模型、校验、全部业务服务、备份/加密格式、数据库迁移框架。
- 平台差异全部收敛在 `PlatformAdapter` 与少量 Electron 专属模块（托盘/快捷键/窗口）。
- 后续 Android 专项启动时，预计主要工作为：PlatformAdapter-Android 实现、 Capacitor 壳工程、移动端导航与触摸交互适配、Keystore/生物识别集成。
