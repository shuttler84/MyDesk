# MyDesk 系统架构

## 1. 总体分层

```
┌──────────────────────────────────────────────────────┐
│ Renderer（React）                                     │
│  pages / layout / components / theme                  │
│  只通过 window.mydesk.invoke(白名单通道) 通信           │
├──────────────────────────────────────────────────────┤
│ Preload（contextBridge）                              │
│  通道白名单 + 统一信封 { ok, data | error }             │
├──────────────────────────────────────────────────────┤
│ Main（Electron 主进程）                                │
│  ipc.ts        — 通道注册 + zod 参数校验                │
│  services/     — 业务逻辑（平台无关、纯 Node）          │
│  vaultManager  — 保险箱会话/自动锁定/剪贴板清理          │
│  platform/     — 平台能力适配层（唯一 electron 依赖点）  │
├──────────────────────────────────────────────────────┤
│ Database（node:sqlite）                                │
│  connection.ts — 打开/PRAGMA/事务/VACUUM INTO           │
│  migrator.ts   — Schema Migration 框架                 │
│  migrations/   — 版本化迁移脚本                         │
└──────────────────────────────────────────────────────┘
```

设计约束（对应任务书第三节）：

1. UI（renderer）不包含业务逻辑与数据访问。
2. 所有数据库访问统一经过 `src/main/services/`。
3. 服务层不 import `electron`；平台能力（shell/clipboard/dialog/路径）全部经由 `PlatformAdapter` 接口注入 —— 这是未来 Android 适配的接缝：只需提供新的 `PlatformAdapter` 实现，服务层与数据模型原样复用。
4. 全栈 TypeScript；共享类型位于 `src/shared/types.ts`（平台无关数据模型）。
5. Electron 安全配置：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、无 `webview`、阻止任意导航与新窗口。
6. 所有 IPC 输入必须通过 `src/shared/validation.ts` 的 zod schema。
7. 备份格式（ZIP + JSON 清单）与加密格式（含算法/版本元数据）均不依赖 Windows。

## 2. 关键流程

### 2.1 启动

1. `app.requestSingleInstanceLock()` 防多开。
2. 打开数据库（WAL）→ `migrate()` 按序执行迁移（失败则弹窗并退出，数据不受影响）。
3. 注册全部 IPC → 启动 30s 周期的保险箱闲置锁定检查 → 创建窗口。

### 2.2 保险箱

- 容器：`{ formatVersion, items[] }` 整体 JSON → AES-256-GCM 加密 → `nonce||ciphertext||tag` 存入 `vault_store`。
- 密钥：主密码 + 随机 salt → Argon2id（64MiB/t=3/p=4）→ 32B key，仅存在于主进程内存。
- 解锁验证即 GCM 认证：密码错误 ⇒ 认证失败。
- 每次修改后立即重加密持久化；锁定/超时调用 `key.fill(0)` 擦除。

### 2.3 备份

- 导出：`VACUUM INTO` 生成一致性快照 → 连同附件写入 ZIP → manifest 记录每个文件的 SHA-256。
- 导入：结构验证 → SHA-256 校验 → `integrity_check` → 版本兼容检查（低版本先在解压库上执行迁移）→ 当前库自动快照 → 替换文件 → 重开验证 → 失败自动回滚。

### 2.4 网页元数据抓取

仅 http/https；8s 超时；响应体 ≤2MB；正则解析 `<title>`/meta/og 标签；所有内容作为纯数据返回，任何失败都允许用户手动填写。

## 3. 目录明细

| 路径 | 职责 |
| --- | --- |
| `src/main/index.ts` | 应用生命周期、窗口、安全策略、迁移触发 |
| `src/main/ipc.ts` | 全部 IPC 注册（通道 → zod → 服务函数） |
| `src/main/services/backupService.ts` | .mydeskpack 导出/导入 + 备份中心（历史/校验/自动备份） |
| `src/main/vaultManager.ts` | 保险箱会话、自动锁定、剪贴板清理 |
| `src/main/services/*` | 任务/收藏/文件索引/笔记/设置/时间轴/Dashboard/搜索/备份/导出/元数据抓取 |
| `src/main/platform/*` | `PlatformAdapter` 接口 + Electron 实现 |
| `src/database/*` | 连接与迁移框架 |
| `src/shared/*` | 类型、IPC 常量、zod 校验、时间工具 |
| `src/preload/index.ts` | contextBridge 桥（白名单） |
| `src/renderer/*` | React UI：主题（CSS 变量 × 5）、布局、通用组件、8 页面 |
| `main/notificationCenter.ts` | 统一通知中心（内存态 + 推送 + 系统通知） |
| `main/tray.ts` | 系统托盘（菜单/图标/关闭行为联动） |
| `main/quickAdd.ts` | 全局快速添加窗口 + Ctrl+Shift+Space |
| `main/reminderScheduler.ts` | 任务到期提醒调度（20s 周期，reminder_log 去重） |
| `main/e2eProbe.ts` / `e2eProbe2.ts` / `uiTour.ts` | 验收辅助（环境变量触发） |
| `shared/quickAdd.ts` / `reminder.ts` | 平台无关的快速添加识别器与提醒核心 |
| `tests/*` | Vitest 测试（helpers 提供平台桩） |

## 4. 渲染层设计系统与主题体系（MyDesk 2.0）

**四层结构**：Design System（布局/信息架构/间距/交互规范）→ Component System（`components/ui.tsx`，组件不依赖主题名称）→ Theme System（主题只改变视觉令牌）→ Page Composition（九页面按统一骨架组合：PageHeader → PageToolbar → Content）。所有主题共享同一套布局架构与交互行为，禁止业务页面按主题名分叉布局（禁止 `if (theme === 'acid')` 式布局分叉）。

**九种主题** = 每主题一组设计令牌（`src/renderer/src/theme/theme.css`）：颜色令牌 `--c-*`（Tailwind 映射消费）+ 组件令牌 `--app-bg / --btn-primary-* / --focus-glow / --card-hover-glow / --c-card-alpha / --c-glass-blur / --shadow-soft|lifted|modal / --heading-font-default`（由基础组件类 `.btn-primary / .field-input / .glass-card` 消费）。主题清单/名称/预览/预览核心色统一注册在 `src/shared/themes.ts`（单一事实来源，新增主题 = 注册 + 一组变量 + preview 色组）。Claude 主题为默认主题（新用户/从未保存主题者生效；已保存偏好的用户升级后保持原选择）。主题级 CSS 覆盖（Acid 直角硬阴影、Neo 粗黑边框方角、Claude 衬线标题）仅作用于视觉层。

**标题字体系统**：`--heading-font` 解析链 = 用户设置 `data-heading`（serif / follow）→ 主题默认 `--heading-font-default`（Claude = 衬线，其余 = 正文字体）→ `var(--app-font)`。衬线字体为思源宋体（Source Han Serif CN，SIL OFL 1.0，随应用打包）。Tailwind 提供 `font-heading` 工具类供 PageHeader / SectionHeading / Dashboard 问候语等消费。

**全局正文字体**：`src/renderer/src/theme/fonts.css`（--app-font 变量，`data-font` 切换）+ `theme/loadFonts.ts`（字体文件经 vite 资源管道 import 后以 @font-face 注入，构建期 100% 解析）。字体设置持久化于 settings 表 `fontFamily` / `headingFont` 键，与主题独立；主进程启动时经 URL 参数注入首屏，防闪烁。切换主题只更新 `<html data-theme>`，全局统一生效。动画偏好写入 `data-animation`，CSS 层统一降级并支持 `prefers-reduced-motion`。

**App Shell**：`layout/Sidebar.tsx`（品牌区 / ＋新建 / 分组导航：工作空间·资料库·回顾·管理 / 最近访问 / 底部状态与设置，折叠状态持久化于 localStorage `mydesk-sidebar-collapsed`，最近访问持久化于 `mydesk-recent-pages`）+ `layout/Topbar.tsx`（页面上下文 / 全局搜索 / 通知中心）。主内容滚动独立于侧栏，内容宽度由各页面按信息密度自定。

## 5. Android 适配预留

- 数据模型（shared/types.ts）、备份格式、加密容器均为平台无关结构。
- 服务层可直接运行于 Node 环境（测试即证明）；移动端可用等效 SQLite 与 hash-wasm。
- Windows 路径与 shell 能力只存在于 `platform/` 与文件索引服务的 stat 封装。
- UI 使用响应式布局（flex/grid + 断点），但移动端 UI 本身不在本期范围。
