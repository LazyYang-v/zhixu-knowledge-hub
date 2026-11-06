# P2 PostgreSQL 基础交付与边界

这是 SQL 基础交付当轮的历史记录。其后本地登录、会话、改密和成员库 ACL 已落地，最新状态见 [身份与授权交付](local-auth-access.md)。默认入口仍兼容 JSON，另有显式 SQL 认证模式；没有自动切换/迁移用户数据，也不表示 P2 完成。下述 001-core 与 8 项测试是当轮范围，不能充当完整最新文件清单。

## 实际文件与实现选择

| 文件 | 当前实现 |
| --- | --- |
| `server/db/migrations/001-core.sql` | 18 张表（含迁移历史和 tenant）；复合 tenant 外键、版本/分块/消息唯一性、活跃文本任务部分唯一索引、大小/状态/序号约束及必要索引 |
| `server/db/session.ts` | 单连接事务、只读 repeatable-read 快照、事务内 search_path、超时、Schema 白名单、迁移校验和/版本保护；不由服务启动调用迁移 |
| `server/db/state-mapping.ts` | JSON 兼容映射；知识库/文档/版本/分块/工作分块/任务/事件/会话/消息分表；配置、追踪快照与旧元数据保留为 JSONB；不是一列保存整个 Db |
| `server/repositories/postgres.ts` | 实现现有 StateRepository；同租户 tenant 行锁串行化写入，读取不缓存；按变化行 upsert/delete，业务/审计/幂等在同一事务；不会自动重试任意 mutation 回调 |
| `server/db/dry-run.ts` | 在新建随机 Schema 中建立结构、导入、强制外键检查、读回全文/关联比较、逐表计数；无条件 rollback，并核验 Schema 不存在 |
| `scripts/migrate-data.ts` | 显式副本、tenant 和连接环境变量；预检后受限重读并比较摘要；只支持 dry-run，无 apply 参数；错误不输出连接串/原始 SQL 异常 |
| `tests/postgres/repository.test.ts` | 8 项真实 PostgreSQL 集成测试，包含 CLI 子进程 |
| `scripts/test-postgres.mjs`、`vitest.postgres.config.ts` | 创建独立 PostgreSQL 18 Alpine 临时容器，随机密码、仅回环地址、无主机数据卷；测试后删除本次创建的容器与临时凭据文件 |

修改 `package.json`/锁文件增加 pg 8.23.1 与类型依赖及两个命令；`tsconfig.tests.json` 纳入独立测试配置。预检的受限 `readRegularFile` 只读函数被导出复用，无读取默认运行数据的逻辑。

这个适配器是增量过渡：仍加载一个 tenant 的当前领域快照，在事务锁内应用原业务回调。它已具备真实 SQL 约束和跨连接互斥，但没有实现面向大规模数据的分页 Repository、SKIP LOCKED worker 或完整 SQL 授权查询，不能据此声称具备企业规模吞吐。没有做性能基线压测。

## 导入与兼容

- 既有业务 ID 保留；无 ID 的版本/分块复用现有 `versionDto` 的确定性 legacy ID。按唯一旧 category 解析 baseId，不能解析或重复时失败。
- 补入 tenantId、基础 revision、空 files/idempotency 和 rulesRevision；旧审计默认 legacy_unverified。来源副本不改写；SQL 读回与这份明确规范化后的数据逐字段比较，不把规范化伪装成原字节相同。
- 文档当前工作分块与各版本分块分别保存，避免处理中内容与版本快照被强制混为一份。任务 kind/state/version 及文档关系为真实列，checkpoint/输入/lease 为执行快照，事件逐行保存。
- 旧成员存 `legacy_members`，不是 users/memberships。旧会话 owner、上传者与资源 grants 仍未映射，不自动归管理员或所有用户。本轮 SQL 适配器没有可供未认证访问的运行入口。
- 新审计通过适配器禁止删除或改写既有 payload；展示位置可以随列表变化。尚未设置专用数据库最小权限角色或数据库审计防篡改策略，不能当作防篡改日志。
- 规范化后的名字在 SQL 中唯一，跨 tenant FK 被数据库拒绝。当前只有固定文本处理任务；索引 profile、published generation、模型等仍属 P3。

## 命令

```bash
npm run --silent data:dry-run -- --help
npm run test:postgres
```

`test:postgres` 只使用脚本自己创建的容器，不读取 DATABASE_URL，也不连接已有数据库。需要 Docker 和 postgres:18-alpine 镜像；缺失依赖或启动失败会失败，不静默跳过。

对明确选定的独立验证数据库，先由操作者通过环境安全注入连接值，再指定变量名：

```bash
npm run --silent data:dry-run -- \
  --input /path/to/stopped-copy/db.json \
  --files-dir /path/to/stopped-copy/files \
  --tenant actual-tenant-id \
  --connection-env ZHIXU_MIGRATION_DATABASE_URL
```

命令要求该环境变量已存在；不把连接串作为参数或写进仓库。输入默认上限 64 MiB，必须是停写后的 JSON 与原件同批副本。原件由只读预检核验，SQL dry-run 不复制、删除或修复原件。

退出码 0 表示本次指定 SQL 导入/读回/回滚检查通过；1 为预检完整性或 SQL 验证失败；2 为参数或预检未完成。成功报告包含 `sqlIntegrity=passed`、`rolledBack=true`、逐表 counts，但始终 `cutoverReady=false`，列出身份/授权/原件留存与复制/认证 API 验收/显式切换等未完成项。

## 验证证据

真实 PostgreSQL 18 容器内 8 项测试通过：规范化读回/独立存表、未知字段保留、8 个独立连接并发写入、失败回调只执行一次且回滚、数据库唯一性/跨 tenant FK、租户隔离与不存在/暂停租户拒绝、迁移校验和保护、事务中途 CHECK 失败回滚、原有 API 幂等与 worker 恢复、适配器审计保护、dry-run 成功后无 Schema、拒绝已有 Schema、实际 CLI 与来源字节保持。

原有 64 项单元/组件/API 测试、类型检查和构建通过。当前运行入口及前端未改，本轮未重跑 E2E；前轮 13 项已通过。Mermaid 大分包与 Zod 注释警告仍存在。首次 6 项测试通过后新增 SQL 直接约束/迁移校验和/中途失败验证，最终为 8 项；没有失败或跳过用例。

## 后续与回滚

当轮后续的 users/identities/sessions/memberships、显式 bootstrap、成员库 grant 与登录 UI 已由 002-auth 和身份模块实现，SQL 认证入口不复用匿名 JSON 的访问方式。完整存量映射、正式 apply/切换与回滚仍待完成。

本轮所有 DDL/数据只在独立测试容器或事务 dry-run 中运行，容器已删除；没有生产 Schema、用户数据库或原件变更。代码回退只撤回本文列出的对应差异和依赖，保留既有 P1/P2 改动。真实迁移 apply/down、备份恢复和切换需另行实现及验证；不能拿测试中的 DROP 临时 Schema 当生产回滚脚本。

事务实现依据：[node-postgres 单连接事务](https://node-postgres.com/features/transactions)、[PostgreSQL 行锁说明](https://www.postgresql.org/docs/current/explicit-locking.html)。
