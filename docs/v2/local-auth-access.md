# P2 本地身份与资源授权交付

状态：本地账户、会话、改密、成员库授权与前端闭环已在隔离 PostgreSQL 验证；**P2 整体仍未完成**。没有将用户现有 JSON 切换到 SQL，没有执行生产迁移或部署；本次代码交付包含实现、测试与文档。旧备份未读取或改动。

## 当前行为与设计选择

- 显式 `ZHIXU_STORAGE=postgres` 才启用认证入口；默认 JSON 保持既有兼容模式，`/api/auth/config` 明确返回 legacy_unsecured，不能当作受保护服务。SQL 启动只检查迁移与已初始化账户，不创建表、不生成管理员或密码。
- 新账户由工作空间管理员创建；旧 members 仍为 legacy_members，不成为登录账户。首账户必须通过显式 CLI 初始化，没有默认用户名、默认密码或公共注册。身份以 users/identities/memberships 为准，不信任 X-User-ID、body.owner、department 或 tenant。
- 密码使用带随机盐的 scrypt（N=131072/r=8/p=1，32 字节输出）；数据库不存明文。派生同时最多 2 项；登录另有每实例 2 项上限。账号尝试 5 次/15 分钟、tenant 总计 120 次/15 分钟；未知账号也执行派生，不把邮箱存入限流键。
- 会话为 32 随机字节，不透明 token 仅在 HttpOnly Cookie；数据库只保存 SHA256。默认 Secure、SameSite=Lax、Path=/，绝对有效期 12 小时。浏览器存储不保存密码/token/CSRF；CSRF 值只在内存。写请求同时检查 Origin 与会话 CSRF。
- 登录恢复、退出、会话失效和错误重试接前端。失效时卸载工作区、清除内存身份，重新登录仍保留原 hash 页面。自助改密验证当前密码，hash 更新/会话撤销/审计原子提交；所有原会话失效，必须使用新密码重新登录。
- role 的能力上限与成员对库的 read/write/publish/manage grant 取交集。admin 可管理账户/授权，**没有自动阅读文档内容的豁免**。创建库在同一事务给创建者授予其角色允许的库能力。不实现部门继承、通配符、deny 或多角色合并。
- 服务实例绑定配置中的可信 tenant；不同 tenant 的 session 不通用，外键含 tenant。每次读事务重新核验会话与授权；每次写先取得 tenant 锁，再重新核验，不能用请求入口缓存的权限提交或重放。
- 现有领域回调通过 AuthorizedRepository 取得可见投影；合并时保留隐藏记录和未修改的脱敏字段。写事务仍使用现有 StateRepository，无第二套 Mock 业务。非空库判断使用完整关系；无阅读权的库管理者改名也维护隐藏文档关联。
- 普通 KR 只读 published_version_id 指定的版本及 publishedMetadata；KW 可编辑草稿/历史。编辑与 worker 完成不切公开指针，显式 publish 才切换。原件下载复验当前可见版本；已发布文档跨库移动额外要求两库 publish，避免编辑权间接扩大公开范围。真实索引代际仍待 P3。
- 会话仅对 ownerMembershipId 可见；旧 owner 未知的会话不自动认领。新检索记录保留实际命中文档 ID；来源撤权、删除或归档后，历史助手消息在响应中脱敏，不重新暴露旧召回全文。问答与引用仍标为规则演示，不因此成为真实 RAG。
- 上传原件 ID 绑定 tenant/实际 uploader，元数据有同租户 uploader 外键；物理 blob 可共享摘要，原件所有权不共享。新文档不能凭别人的 artifactId 引用暂存文件；已关联原件按当前文档权限下载。
- 账户角色/状态变化撤销其已有会话；最后一名活跃管理员有事务保护。授权 PUT 使用库 revision；原有业务幂等重放仍按当前授权复验。auth 新建账户靠邮箱唯一性防重复，auth 管理写入没有新增通用 Idempotency-Key 重放协议，网络结果不确定时需刷新核对，不能声称已具备这项能力。
- 新业务日志的 actor 为可信 user ID/显示名，SQL 记 enforced；JSON 仍为 anonymous/not_configured。账户/登录/授权/改密用 auth_events 留痕；HTTP 补充日志含统一 requestId/状态，不保存正文/密码/Cookie。补充 HTTP 审计独立尽力提交，失败告警不掩盖原结果；业务/身份成功提交审计各在自己的事务内。没有宣称日志防篡改。

首版只实现本地身份。auth_identities 的 provider/subject 和统一 session/principal 为后续 SSO 留出数据及接口位置；OIDC 跳转、签名验证、PKCE、MFA、邀请邮件、找回密码、强制首次改密均未实现。初始凭据需安全交付，用户可立即自助改密。当前限流是本地 MVP 策略，生产流量与可信代理策略尚未验收。

## 文件清单

| 范围 | 新增或修改的真实路径 |
| --- | --- |
| 身份 Schema | NEW `server/db/migrations/002-auth.sql`：8 张身份/授权/审计表；documents 发布指针，file_artifacts uploader 与 conversations owner 同 tenant 外键；`server/db/session.ts` 支持有校验和的 001/002 与只读启动校验 |
| 身份与授权模块 | NEW `server/auth/{password,service,policy,repository,app}.ts`；NEW `shared/auth.ts`：角色能力与会话响应 Schema |
| 运行与 CLI | `server/index.ts`、`server/app.ts`、`server/http/errors.ts`；NEW `scripts/init-local-auth.ts`；package 增加 auth:init/test:auth:e2e |
| 原件/版本/DTO | `shared/contracts.ts`、`server/types.ts`、`server/db/state-mapping.ts`、`server/services/{consistency,files,audit,capabilities}.ts`、`server/routes/{files,knowledge,conversations,governance}.ts` |
| 前端身份 | NEW `src/providers/AuthProvider.tsx`、`src/lib/auth-session.ts`、`src/hooks/useAuthorization.ts`、`src/components/ChangePasswordDialog.tsx`、`src/pages/auth.css`；`src/main.tsx`、请求/上传层、Topbar/ConnectionStatus |
| 账户与授权 UI | NEW `src/pages/AccessPage.tsx`；PermissionsPage 按实际认证模式选择真实账户界面或原兼容界面；文档/知识库/设置关键操作按权限禁用；请求拒绝时清空不可再展示的资源结果 |
| 审计 UI | NEW `src/features/audit/AuthEventsPanel.tsx`；AuditPage 展示身份/授权记录并明确实际权限状态 |
| 测试与截图 | NEW `tests/postgres/auth.test.ts`、`tests/auth-e2e/workspace.spec.ts`、`playwright.auth.config.ts`、`scripts/test-auth-server.ts`；更新 test-postgres runner、测试 tsconfig、API 单测及 .gitignore；截图在 artifacts/p2-*.png，仅含隔离样本数据 |

002 新表：users、auth_identities、roles、memberships、knowledge_grants、auth_sessions、login_attempts、auth_events。实际列、状态 CHECK、PK/UQ/FK/索引以 SQL 为准，不把目标设计中未建的 departments/model/index/Agent 表算入本轮。

## API 契约

所有本地认证接口实现于 `server/auth/app.ts` / `service.ts`，前端为 AuthProvider、ChangePasswordDialog、AccessPage、AuthEventsPanel。错误沿用 `{error,code,requestId}`，密码字段错误只给通用说明，不回显字段值。

| Method / Path | Request → Response | 权限、错误、重复规则 |
| --- | --- | --- |
| GET `/api/auth/config` | ∅ → `{mode:'local',registration:'admin_only'}`；JSON 模式为 legacy_unsecured | 公开模式发现；R |
| POST `/api/auth/login` | email≤254、password 1..128 → `{user,csrfToken}` + HttpOnly Cookie | Origin；INVALID_CREDENTIALS 401、LOGIN_RATE_LIMITED/LOGIN_BUSY/PASSWORD_SERVICE_BUSY 429；每次成功创建新 session，不重放凭据结果 |
| GET `/api/auth/me` | Cookie → `{user,csrfToken}` | 可信 session，否则 401；R；user 字段见 shared/auth.ts，含本人的能力/grants 和可见账户计数，不含凭据 |
| POST `/api/auth/logout` | Cookie + CSRF → `{ok:true}`，清 Cookie | 撤销当前 session；已撤销再次调用 401，前端视为已退出 |
| POST `/api/auth/password` | currentPassword 1..128、newPassword 12..128 → `{ok:true}`，清 Cookie | 本人 session + CSRF；CURRENT_PASSWORD_INVALID/PASSWORD_UNCHANGED 400、PASSWORD_CHANGED 409、PASSWORD_RATE_LIMITED 429；成功后全部旧 session 失效 |
| GET `/api/auth/access` | ∅ → `{members,grants}` | WA；仅本 tenant；member 有 id/name/email/role/status/revision；R |
| POST `/api/auth/members` | name 1..160、email≤254、password 12..128、role admin/editor/viewer → `{memberId}` 201 | WA + CSRF；EMAIL_ALREADY_REGISTERED 409；不发送邮件，无自动密码，无通用重放；刷新可核对结果 |
| PATCH `/api/auth/members/:id` | revision>0、role、status active/disabled → `{ok:true}` | WA + CSRF；LAST_ADMIN/VERSION_CONFLICT 409；状态变化撤销会话；revision 保护 |
| PUT `/api/knowledge/bases/:id/grants` | revision、≤200 个 `{memberId:UUID,permissions:[read/write/publish/manage]}` → `{ok:true}` | WA 或有效 KM + CSRF；重复 member 拒绝；ROLE_CAP_EXCEEDED 400、VERSION_CONFLICT 409；替换整库 grant、提升库 revision，无通用重放 |
| GET `/api/auth/events` | ∅ → 最近 200 个 `{id,time,actor_membership_id,action,target_id,outcome,request_id,method,http_status}` | AR；本 tenant；R，无凭据/正文 |

原有业务 API 在 SQL 模式必须有 session，列表与聚合按可见投影返回；独立资源不可见返回 404、无操作能力返回 403。遗留 `/permissions/members` 与 `/permissions/rules` 写操作在 SQL 模式返回 LEGACY_CONFIG_READ_ONLY，不让静态矩阵影响真实权限。发布/归档导致调用者失去阅读可见性时，document 回执标 redacted、内容为空，前端从列表移除，不将部分回执伪装成可读全文。

JSON 模式维持兼容行为，未启用身份/资源 ACL。真实模型、真实引用定位与 SSE 未实现；scope 不是授权，baseIds 仍显式拒绝。

## 显式启用与初始化

仅查看参数（不会连接数据库）：

```bash
npm run --silent auth:init -- --help
```

已有明确选定的独立 SQL 工作空间可初始化首账户；连接与密码从环境安全注入，不作为命令参数或写进仓库：

```bash
npm run --silent auth:init -- --connection-env ZHIXU_DATABASE_URL --tenant actual-tenant --email operator@example.com --name Operator
```

这条命令会在**显式目标**事务中应用已知迁移、建立首账户；已有账户时拒绝。需要创建全新空工作空间时，额外提供 `--create-empty-workspace --workspace 'Workspace Name'`。空工作空间没有 seed 文档/成员/会话；已存在 tenant 时不覆盖。密码必须在 `ZHIXU_BOOTSTRAP_PASSWORD` 中，12..128 字符。CLI 已做真实子进程验证，但未对用户数据库执行。

配置以下环境后启动后端（示例只列变量名，真实连接不写入文档）：

```text
ZHIXU_STORAGE=postgres
ZHIXU_DATABASE_URL=<由安全环境注入>
ZHIXU_TENANT_ID=<已初始化的 tenant>
ZHIXU_DB_SCHEMA=zhixu
CORS_ORIGINS=<明确的前端 Origin 列表>
```

默认使用 Secure Cookie；HTTPS 由受控入口提供。仅本地开发可显式设置 `ZHIXU_ALLOW_INSECURE_LOCAL_AUTH=true`；production 模式拒绝此配置，SQL API 绑定 127.0.0.1。启动发现迁移不匹配/无活跃账户会失败，不自动修复。没有把现有 JSON 导入 SQL，也没有创建任何生产管理员。

## 验证、失败记录与验收

```bash
npm run check:tests
npm test
npm run test:postgres
npm run test:e2e
npm run test:auth:e2e
npm run build
```

最新结果：65 项单元/组件/API、21 项真实 PostgreSQL、类型检查和构建通过；原有 13 项 E2E 为上一轮通过结果，本次安全修复没有重跑这组。5 项认证 E2E 的本次结果见下方安全收尾记录。SQL/浏览器认证测试均自建独立 PostgreSQL 18 容器和临时目录，不使用用户 data/db.json 或备份。构建仍有 Mermaid 大分包和 Zod 注释警告，未声称解决。

| 验收域 | 实际证据与通过条件 |
| --- | --- |
| 登录/会话/改密 | 密码与 token 只存 hash；未认证/自称身份 header 被拒绝；错误密码不登录；恢复当前页；退出/过期/停用拒绝旧 cookie；改密需原密码且所有旧 session 失效 |
| 可信身份与管理员 | legacy members 不成为账户；首账户不授内容读权；bootstrap 重复拒绝；最后管理员不能停用/降权，并发变更仍保留一名 |
| 库/文档/原件 | 列表/详情/检索/任务只返回授权来源；别人的暂存原件不能附加；同字节上传元数据按用户隔离；撤权后下载拒绝 |
| 发布与历史 | worker 完成后 KR 仍读旧发布版本及标题；显式发布才更新；撤权后旧会话召回内容脱敏；旧 owner 不认领 |
| 并发与重放 | 独立连接并发写不丢记录；等待 tenant 锁的请求在撤权提交后返回 403；旧业务幂等键重放再次检查当前权限 |
| 隐藏记录 | 无内容读权的管理者改名仍维护关联；非空库返回 409 并保留数据；归档失去可见性返回 redacted 回执 |
| UI | 创建账户、保存并刷新库 grant、改密、新密码登录均经真实浏览器；禁止操作禁用；390px 无整页横溢；登录按实际 html data-theme 检查浅深主题 |
| 审计 | Auth/业务日志不含密码和 token；补充 HTTP 日志可用 requestId 关联响应；只在真实 SQL 模式标 enforced，规则引用仍不作真实来源 |

曾失败并已修复：可见集合合并使新版本排到旧版本后，触发完整性失败；非空库判断晚于完整性预检而返回 500；授权保存 `{ok:true}` 被客户端误按 `{base}` 校验；E2E 精确 label 包含必填星号而超时；主题测试重复初始化脚本使两张截图实际相同；测试 helper 的 Response/Promise 联合类型。定向检查未选其他测试不等于最终跳过，最终按上述范围全量验证。

截图只含临时样本：[登录浅色](../../artifacts/p2-login-mobile-light.png)、[登录深色](../../artifacts/p2-login-mobile-dark.png)、[账户桌面](../../artifacts/p2-access-desktop.png)、[账户移动](../../artifacts/p2-access-mobile.png)、[授权矩阵](../../artifacts/p2-grants-desktop.png)。截图用于视觉核验，功能证据仍是实际 API/SQL/浏览器结果。

## 上传与请求体检查顺序修复

安全回归先复现两个缺陷：无 upload 能力的 viewer 收到 403，但磁盘已产生一条无元数据原件；未登录请求返回 401 前已读取一次请求体。`npm run test:postgres` 修复前为 19 通过、2 失败，失败断言分别为原件目录非空与请求体读取次数 1 而非 0。

修改 `server/auth/app.ts`、`server/auth/policy.ts`、`server/routes/files.ts` 与 `tests/postgres/auth.test.ts`：Origin、session、CSRF、上传 capability 在 body-limit 读取请求体前检查；登录单独保留 body-limit；上传路由在解析 multipart 和落盘前调用 repository.load 复验资源策略。元数据提交仍在写事务内重新核验权限。没有修改 API Schema、SQL 迁移或前端。

修复后 21 项 SQL 测试通过，包括无权限上传不留文件、匿名/缺 CSRF/不可信 Origin 拒绝时不读取流、授权上传与可信登录仍拒绝声明超过 24 MiB 的请求；65 项常规测试、测试类型检查、构建与 git diff --check 通过。5 项认证 E2E 补跑全部通过，无失败或跳过；原有 13 项 JSON E2E 此次未重跑。两次 SQL 验证与认证 E2E 的隔离容器均已清理。

这项修复不保证文件系统与 SQL 跨资源原子性：已获准请求在写盘后崩溃、会话失效或授权被并发撤销，仍可能留下不可下载的孤立字节；写事务会拒绝无权限元数据提交，清理政策仍待实现。没有自动删除原件。单独回退本节四个实现/测试文件的差异不会改变数据格式，但会重新暴露上述缺陷，不应作为常规恢复办法。

## 仍未完成与回滚

P2 后续：存量身份/owner/grant 映射与认领、正式迁移 apply/备份恢复/切换后回滚、原件保留与清理政策、auth 管理写入的通用幂等重放、专用最小权限数据库角色与进一步安全/多实例验收。当前快照适配器仍按 tenant 串行处理完整快照，未做大数据量 SQL 分页/吞吐基线。完整 OIDC/MFA/找回密码与强制首次改密不在本轮完成范围。RAG/Agent、生产部署均未启动。

没有来源数据待回滚。未应用到用户数据库时，可撤回本文列出的代码/依赖差异，保留原 P1/P2 改动。SQL 002 若已有真实用户数据，禁止直接 DROP 表/列或降级服务绕过认证；先停写、备份并导出账户/会话/授权/发布指针，制定兼容恢复方案。JSON 默认模式是兼容开发入口，不是安全回滚方案，不应把受保护 SQL 数据转接到匿名入口。密码单向派生，不能通过回滚恢复旧明文；用户需重新验证/设置。旧会话、原件与 unknown owner 记录不自动删除或认领。

实现依据：[OWASP scrypt 建议](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt)、[Node.js scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)、[node-postgres 事务](https://node-postgres.com/features/transactions)。
