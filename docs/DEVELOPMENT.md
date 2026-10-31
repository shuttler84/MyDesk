# 开发指南

## 环境要求

- Windows 10/11、Node.js ≥ 22（开发时使用 v24）、npm ≥ 10。
- 无需 Visual Studio 构建工具：SQLite 使用 Node/Electron 内置 `node:sqlite`，Argon2 使用 WASM（hash-wasm），全项目零原生编译依赖。

## 常用命令

```bash
npm install          # 安装依赖（Electron 二进制下载慢时见 README 镜像提示）
npm run dev          # 开发模式（主进程热重启 + 渲染进程 HMR）
npm run build        # 构建主进程/preload/渲染进程到 out/
npm run typecheck    # 两个 tsconfig 的严格类型检查
npm test             # Vitest 全部测试
npm run dist         # 构建 + electron-builder 打包（releases/）
```

npm 11 的安装脚本审批机制：如安装后被拦截，执行
`npm install-scripts approve esbuild electron electron-winstaller` 后 `npm rebuild electron esbuild`。

## 开发约束（必须遵守 AGENTS.md）

1. 业务逻辑写进 `src/main/services/`，不 import electron；需要平台能力时通过 `PlatformAdapter`。
2. 任何新 IPC：`src/shared/ipc.ts` 加通道 → `src/shared/validation.ts` 加 zod schema → `src/main/ipc.ts` 注册 → `src/preload` 无需改动（白名单自动包含）。
3. 任何数据库结构变化：新建迁移（见 docs/DATABASE_MIGRATION.md），禁止改旧迁移。
4. UI 新组件必须兼容五种主题：只使用 Tailwind 主题令牌色（`bg-surface-2`、`text-text-2` 等）与 `glass-card`，禁止硬编码颜色。
5. 提交前：`npm run typecheck && npm test && npm run build` 全部通过。

## 测试

- `tests/helpers.ts` 提供 `makeContext()`：临时目录 + 平台桩 + 已迁移数据库。
- 覆盖面：迁移（5）、任务规则（4）、保险箱（5）、备份恢复（5）、导出（5）、冒烟（2）。
- 保险箱测试较慢（Argon2id 64MiB 派生 ~0.5s/次），属预期。

## 打包

- `electron-builder.yml`：NSIS 安装包 + 便携版，x64；图标 `build/icon.png`（自动转换 ico）。
- 产物输出 `releases/`：`MyDesk-1.0.0-Setup.exe`、`MyDesk-1.0.0-Portable.exe`。
- 数据目录 `%APPDATA%/mydesk`，升级安装不触碰用户数据。

## 已知工程说明

- Electron 45 起 `clipboard.readText()` 为异步 API（W3C 对齐），平台适配层已封装。
- 渲染进程使用沙箱模式，preload 仅能使用 `electron` 的 renderer API（当前只用了 contextBridge/ipcRenderer）。
