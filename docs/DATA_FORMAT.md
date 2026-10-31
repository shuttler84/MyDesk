# 数据与备份格式说明

## 1. 本地数据布局

```
%APPDATA%/mydesk/
├── mydesk.db            # SQLite 数据库（WAL 模式，含 mydesk.db-wal / -shm）
└── attachments/         # 笔记附件（磁盘文件名为随机 UUID，原名存于数据库）
```

- 无账号体系、无网络上传；软件版本与 Schema 版本独立（见 docs/DATABASE_MIGRATION.md）。

## 2. `.mydeskpack` 完整备份格式（Format v1）

`.mydeskpack` 是 ZIP 容器，内部结构固定：

```
manifest.json
data/database.sqlite      # 数据库一致性快照
attachments/<stored_name> # 笔记附件（如有）
```

### manifest.json 字段

| 字段 | 说明 |
| --- | --- |
| `app` | 固定 `"MyDesk"` |
| `formatVersion` | 备份格式版本，当前 `1`；结构变化必须递增 |
| `appVersion` | 导出时的软件版本 |
| `schemaVersion` | 导出时的数据库 Schema Version |
| `createdAt` | ISO 8601 导出时间 |
| `files` | `{ 相对路径: SHA-256 }` 完整性清单 |
| `includesVault` | 恒为 `true`——保险箱数据**保持 AES-256-GCM 加密**随库打包 |

### 关键保证

- **一致性快照**：`VACUUM INTO`（SQLite Backup API 等效机制）在隐式事务中读取，正确处理 WAL 与进行中的事务；绝不直接复制在用数据库文件。
- **不解密**：备份全程不触碰保险箱明文，恢复后仍需主密码解锁。
- **不含垃圾**：不打包 WAL/SHM、日志、缓存。
- **可移植**：纯 ZIP + JSON + SQLite，不依赖 Windows。

### 导入流程（实现于 `backupService.importBackup`）

1. 选择文件 → 2. 结构验证（manifest 存在、app 正确、formatVersion ≤ 支持）→ 3. 逐文件 SHA-256 校验 → 4. 解压库 `integrity_check` → 5. Schema 兼容检查（低版本先在解压库上跑迁移；高版本拒绝）→ 6. 预览数据数量由用户确认 → 7. 当前库自动生成安全快照 → 8. 关连接 → 替换数据库文件（清理 WAL/SHM）→ 重开并验证 → 恢复附件 → 9. 任一步失败：用安全快照回滚，原数据无损。

**不提供"合并导入"**——为避免 ID 冲突/外键/重复记录等不可靠风险，仅提供完整恢复（任务书允许并要求如实实现）。

### 自动备份与备份中心（1.1.0）

- 自动备份写入 `%APPDATA%/mydesk/backups/`，文件名 `MyDesk自动备份-<时间戳>.mydeskpack`，格式与手动备份完全相同（formatVersion 1）。
- 按设置频率（每天/每周）静默执行，超频才触发；超出保留份数自动清理最旧的自动备份。
- 备份历史直接读取备份归档的 manifest 与快照统计，展示大小/时间/版本/数据量/完整性；完整性 = 逐文件 SHA-256 校验 + 数据库快照可打开性。
- 恢复历史中的备份走与手动导入完全相同的"验证 → 快照 → 替换 → 失败回滚"流程。

### 备份格式升级策略

未来如需改变归档结构：递增 `formatVersion`，读取端按版本分支兼容读取或提示转换；旧备份必须永远可读（由测试保障）。

## 3. 通用导出格式

| 格式 | 内容 | 注意 |
| --- | --- | --- |
| JSON | tasks / collections / fileIndex / notes + 元信息（appVersion、schemaVersion、exportedAt） | `includesVault: false`；**永不包含保险箱数据** |
| CSV | 任务 / 收藏 / 文件索引 三种 | UTF-8 带 BOM（Excel 中文兼容）；RFC 4180 转义 |
| Markdown | 全部笔记（含 front-matter 信息行与正文） | 不含保险箱 |

保险箱导出唯一途径：`.mydeskpack`（数据保持加密）。如需在软件外部使用保险箱条目，须先解锁后逐条复制。

## 4. 加密容器格式（保险箱）

```
vault_store:
  data      = nonce(12B) || ciphertext || tag(16B)   # AES-256-GCM, AAD="mydesk-vault:v1"
  salt      = 16B 随机
  kdf_json  = { name:"argon2id", memoryKiB:65536, iterations:3, parallelism:4, hashLength:32, saltBytes:16, nonceBytes:12 }
  algo      = "AES-256-GCM"
```

- 明文容器：`{ formatVersion: 1, items: VaultItem[] }`（JSON UTF-8）。
- 加密格式版本 `VAULT_FORMAT_VERSION = 1` 独立管理；AAD 绑定版本防止跨版本误用。
- 修改加密结构时必须：新增版本号 + 读取旧版本能力 + 升级迁移（在解锁会话内重加密）。
