# MyDesk

**Your Personal Digital Space.**

MyDesk 是一款本地优先（local-first）的 Windows 桌面个人数字工作台，集任务管理、网络资源收藏、私密保险箱、文件索引和 Markdown 笔记于一体。所有数据保存在本机 SQLite 数据库中，不注册账号、不依赖云服务器、不上传个人数据。

## 功能总览

| 模块 | 说明 |
| --- | --- |
| **Dashboard** | 日期时钟、今日任务进度、统计概览、重要事项、最近内容、快捷操作 |
| **Tasks** | 新建/编辑/删除/完成、拖拽排序（持久化）、优先级、截止日期时间、备注、重要置顶、未完成任务自动延续到今日 |
| **Collections** | 收藏网站/GitHub/Bilibili/YouTube/论坛/文章，自动抓取标题/描述/图标/预览图，重复检测，卡片/列表视图，多标签筛选 |
| **Private Vault** | 独立主密码，Argon2id + AES-256-GCM 整容器加密，闲置自动锁定，剪贴板定时清理，密钥轮换 |
| **File Index** | 记录重要文件位置，路径有效性检查，打开文件/所在目录，复制路径 |
| **Notes** | Markdown 编辑与预览、代码块、图片附件、分类、标签、搜索 |
| **Timeline** | 每日任务完成/收藏/笔记/文件索引统计、最近活动、日期筛选 |
| **Settings** | 五种主题（Mint / Lavender / Cream / Midnight / Glass）、动画选项、启动页、备份与恢复、JSON/CSV/Markdown 导出 |

## 技术栈

- **Electron 45** + **React 18** + **TypeScript** + **Tailwind CSS** + **Framer Motion**
- **SQLite**（Node/Electron 内置 `node:sqlite`，WAL 模式，零原生编译依赖）
- **Argon2id**（hash-wasm）+ **AES-256-GCM**（Node crypto）
- **electron-vite** 构建，**electron-builder** 打包

## 快速开始（开发）

```bash
npm install        # 安装依赖
npm run dev        # 开发模式启动
npm test           # 运行自动化测试（26 个用例）
npm run typecheck  # TypeScript 类型检查
npm run dist       # 构建 + 打包 Windows 安装包/便携版（输出到 releases/）
```

> 提示：若 Electron 二进制下载缓慢，可设置镜像 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后执行 `node node_modules/electron/install.js`。

## 数据存储位置

- 数据库：`%APPDATA%/mydesk/mydesk.db`（SQLite，WAL 模式）
- 笔记附件：`%APPDATA%/mydesk/attachments/`
- 设置页中可查看实际路径。

## 备份与迁移

- 完整备份格式为自定义的 **`.mydeskpack`**（ZIP 容器：数据库一致性快照 + 附件 + SHA-256 清单），保险箱数据在备份中**保持加密**。
- 恢复流程：验证归档 → 校验完整性 → 兼容性检查 → 自动备份当前库 → 恢复（失败自动回滚）。
- 数据库结构从第一天起使用 Schema Migration 管理（`user_version` + `migration_history`），详见 `docs/DATABASE_MIGRATION.md`。

## 项目结构

```
MyDesk/
├── AGENTS.md                  # 永久开发规范
├── docs/                      # 架构 / 迁移 / 数据格式 / 安全 / 使用说明 / 测试报告
├── migrations/                # 迁移脚本 SQL 存档
├── src/
│   ├── main/                  # Electron 主进程（IPC、平台适配、服务层）
│   │   ├── services/          # 业务逻辑（平台无关，可测试、可移植）
│   │   └── platform/          # 平台能力适配层（Android 适配预留接缝）
│   ├── preload/               # contextBridge 受控桥接
│   ├── renderer/              # React 界面（主题 / 布局 / 8 个页面）
│   ├── database/              # 连接、迁移框架、Schema V1
│   └── shared/                # 跨进程共享类型、IPC 契约、zod 校验
├── tests/                     # Vitest 自动化测试
├── build/                     # 应用图标等打包资源
└── releases/                  # 打包产物
```

## 安全模型（摘要）

- 渲染进程 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 所有 IPC 输入经 zod 校验；通道白名单在 preload 中强制执行。
- 保险箱：主密码不落盘，Argon2id 派生密钥仅存于主进程内存，锁定即擦除；数据库中不存在任何明文。
- 普通搜索永远无法触达保险箱数据；普通导出（JSON/CSV/MD）不含保险箱内容。
- 网页元数据抓取仅作为纯数据处理（8s 超时、2MB 上限、仅 http/https）。

完整说明见 `docs/SECURITY.md`。

## 许可证

MIT
