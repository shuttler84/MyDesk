# 数据库迁移脚本归档

此目录存放每个 Schema 版本的 SQL 存档，供审阅与人工比对。
**权威实现**位于 `src/database/migrations/`，二者必须保持一致。

- `001_initial_schema.sql` — Schema V1（MyDesk 1.0.0）

新增迁移时的流程（详见 docs/DATABASE_MIGRATION.md）：

1. 在 `src/database/migrations/` 新建 `NNN_description.ts`，追加到 `index.ts` 数组末尾。
2. 将等价 SQL 存档到本目录。
3. 在测试数据库上验证迁移（`npm test`）。
4. 更新 `docs/DATABASE_MIGRATION.md` 与 Schema Version 文档。
