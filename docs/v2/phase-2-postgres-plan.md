# P2 PostgreSQL 与本地身份执行计划

用户已于本轮明确选择推荐方案：PostgreSQL、本地账户登录并预留 OIDC/SSO。替代此前“选型待答复”的状态；不授权生产切换、删除原数据或不可逆迁移。

1. 数据库基础：新增 `server/db/migrations/001-core.sql`、`server/db/session.ts`、`server/repositories/postgres.ts` 与关系映射。沿用 StateRepository，核心实体、版本、分块、任务和消息分别存表，使用带 tenant 的外键/唯一约束；事务内串行化同租户写入。先保持当前运行入口使用 JSON。
2. 安全导入：新增 `scripts/migrate-data.ts`，只接受显式副本和连接环境变量；预检后在新建临时 Schema 内导入、核对内容/关系并无条件 rollback。没有 apply 分支，不修改连接配置；保留旧 ID，生成确定性版本/分块 ID，旧 owner 不自动认领。
3. 本地身份：新增 users/auth_identities/sessions/memberships、scrypt 密码派生、不透明会话、登出撤销、登录限流与 CSRF。显式 bootstrap 创建首账户，不从 Member 或浏览器缓存推断可信用户。OIDC 只预留接口，不声称已实现。
4. 后端授权：role 能力上限与成员库 grant 取交集；覆盖列表、详情、编辑、发布、文件、检索、会话、任务及审计。权限在 mutation 事务内复验，撤权后重放不能越权。旧 owner 未知的会话/文件隔离，不自动授权。
5. 前端：登录/过期恢复、退出、真实成员与库授权管理，复用现有组件/主题，不替换技术栈。
6. 隔离验收：真实 PostgreSQL 临时容器内验证跨连接并发、事务失败、外键、唯一性、重启、dry-run 无残留；两用户/两租户与撤权/幂等/下载测试；原有测试/E2E/build 全量回归。

每一小步报告实现/未实现与实际测试，不将数据库基础当作 P2 完成。完整 P2 验收后再确认 P3。新增 SQL/身份选择不会自动切换当前 JSON 服务。

回滚：当前数据库基础无运行切换，撤回对应文件/依赖差异即可；测试只删除本次创建的临时 Schema/容器。真实用户数据与原件保持原位。身份接入后的会话兼容及数据变更需另列具体回滚边界。
