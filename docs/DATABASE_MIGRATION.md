# 数据库迁移规范（Schema Migration）

## 1. 版本管理模型

- **Schema Version** 存储于 SQLite `PRAGMA user_version`，与软件版本号完全独立。
- 当前版本链：
  - `001_initial_schema`：v0 → v1（MyDesk 1.0.0 初始结构）
  - `002_task_reminders`：v1 → v2（MyDesk 1.1.0，任务提醒：tasks.reminder_minutes 列 + reminder_log 表，纯新增）
- 迁移脚本权威实现：`src/database/migrations/`；SQL 存档：`migrations/`（人工比对用）。
- 历史记录表 `migration_history`：migration_id、from_version、to_version、description、script_hash、executed_at、success。

## 2. 迁移框架行为

`src/database/migrator.ts` 保证：

1. 启动时自动按序执行所有未应用的迁移；已是最新则幂等跳过。
2. 每个迁移在 `BEGIN IMMEDIATE ... COMMIT` 事务中执行，失败自动回滚并**停止后续升级**，抛出含迁移 ID 的明确错误。
3. 应用遇到"数据库版本高于软件支持"时拒绝启动迁移（提示升级软件），原数据不动。
4. 迁移链在运行前校验连续性（from==上一 to，to==from+1）。
5. 迁移脚本发布后不可修改（script_hash 绑定 ID 与版本区间）。

## 3. 新增迁移的标准流程

1. 在 `src/database/migrations/` 新建 `NNN_description.ts`，实现 `Migration` 接口并追加到 `index.ts` 数组**末尾**。
2. 将等价 SQL 存档到 `migrations/NNN_description.sql`。
3. 编写/更新测试（`tests/migration.test.ts` 模式：新库迁移、旧库+数据迁移、幂等性）。
4. 运行 `npm test` 与 `npm run typecheck`。
5. 重大迁移发布前：先在正式数据副本上演练，并确认自动备份可用。
6. 更新本文档的版本链与 `docs/ARCHITECTURE.md` 中相关表结构说明。

## 4. 禁止事项（AGENTS.md 第 3 节）

- 删除旧数据库重建、清空数据解决冲突。
- 跳过中间版本直接升级。
- 修改字段含义而不迁移旧数据。
- 在正式用户数据上运行未测试的迁移。
- 迁移失败后继续启动写入。

## 5. Schema V1 表结构

| 表 | 说明 | 关键约束/索引 |
| --- | --- | --- |
| `migration_history` | 迁移历史 | migration_id UNIQUE |
| `tasks` | 任务 | priority CHECK；idx(completed,due_date)、idx(sort_order)；V2 新增 reminder_minutes（null=默认策略，0=到期时，N=提前 N 分钟） |
| `collections` | 收藏 | type/research_status CHECK；idx(type)、idx(created_at) |
| `file_index` | 文件索引 | idx(created_at) |
| `notes` | 笔记 | idx(updated_at) |
| `note_attachments` | 笔记附件 | note_id FK → notes ON DELETE CASCADE；stored_name UNIQUE |
| `vault_store` | 保险箱加密容器 | 单行(id=1)；data=nonce‖密文‖tag；**无明文** |
| `settings` | 键值设置 | key PK |
| `activity_log` | 活动记录 | idx(created_at) |
| `reminder_log` | 任务提醒去重记录（V2） | task_id FK → tasks ON DELETE CASCADE；idx(task_id) |

ID 一律为 UUID 字符串（除 activity_log 自增与 vault_store 固定单行）；时间一律 UTC ISO 8601 字符串；标签字段存 JSON 数组文本。
