# API 目录：当前契约与候选增量

日期：2026-11-06。配套 [系统审查](phase-0-system-audit.md)、[数据/Agent 设计](target-data-agent-design.md)。

当前表按工作区源码核验，不是 OpenAPI 自动生成结果；快照有 38 个 handler，当前增加原件上传/下载、任务取消/事件、批量分块共 5 个，为 43 个（含 health）。静态 handler 数不等于已经逐一做过集成测试。标 NEW 的接口全部尚未实现，不能用于调用。路径末尾 `/` 以当前 Hono 挂载为准；页面请求的无末尾斜杠形式已有回归覆盖。

## 1. 公共约定与 Schema

现有成功响应保留各域封装，不为了统一外观破坏现有客户端。错误统一为：

```ts
type ErrorBody = {
  error: string;
  code: string;
  requestId: string;
  details?: unknown;
};
```

当前 Request 的严格 Zod 定义位于 `shared/contracts.ts`，body 读取/规范化位于 `server/http/validation.ts`；不是客户端可以绕开的前端校验。当前并非所有成功响应都有运行时完整校验；上传 artifact 已有共享响应 Schema。普通名称最长 160 字符，短字段最长 500；下述别名取实际约束：

| Request 别名 | 当前字段与约束 |
| --- | --- |
| `BaseCreate` / `BaseUpdate` | name 必填/更新可选；description、owner 可选短字段，color=purple/blue/green/orange，access 为现有部门/项目范围枚举；更新需 revision 才能写入 |
| `Import` | 公共 name，baseId 或 category，department、level=公开/内部/机密、owner、strategy；mode=text 时 text 非空且≤2,000,000；mode=file 必须 artifactId=`file_`+64 hex；mode=web 必须 URL source。网页不执行抓取 |
| `DocumentUpdate` | 可选 name/baseId/category/department/level/strategy，revision；未知字段拒绝 |
| `ChunkUpdate` / `ChunksUpdate` | content 或 chunks，保留空白但 trim 后不能空；单块≤100,000、数量≤10,000、总量≤8,000,000 UTF-16 码元；revision；批量不改变布局数量 |
| `VersionOperation` | version 匹配 `v整数.整数`，revision |
| `StateOperation` | 可选 revision；文档 publish/archive handler 强制需要；task retry/cancel 不依靠该字段授权 |
| `ConversationCreate` | 可选 title |
| `MessageInput` | content 非空≤20,000，scope，citations、multiTurn；Schema 预留 baseIds≤50，但中间件对显式 baseIds（含空数组）返回 400 BASE_ROUTING_UNAVAILABLE，不静默忽略，也未实现多库路由 |
| `Feedback` | rating=up/down/null，comment 可选≤2,000 |
| `Retrieval` | query 非空≤4,000；strategy=BM25/向量检索/混合检索；scope；显式 baseIds 返回 400 BASE_ROUTING_UNAVAILABLE；threshold 0..1；topK 1..20 |
| `EvaluationCreate` | 可选 name/dataset；dataset 当前只是名称，不是已上传/选中的真实评测集 |
| `MemberCreate` / `MemberUpdate` | name、email（转小写）、department、role=知识库管理员/内容编辑者/普通成员；更新字段可选但 handler 要 revision |
| `RuleUpdate` | key=`部门:角色:0..3`；values 为长度 4 的 boolean 数组；revision；本质仍是旧全局静态矩阵 |
| `SettingsUpdate` | workspace/tenant/embedding/vector/strategy；chunkSize/overlap/topK 为有范围的数字字符串；rerank/citations/multiTurn/audit 为 boolean；revision。tenant 不能通过本接口改变，overlap 必须小于 chunkSize |
| `FileUpload` | multipart/form-data，且只有一个名为 file 的文件；≤20MB，名称≤160、不含路径/控制字符；类型与轻量签名/文本编码检查见 FileStore |

Response 别名来自 `server/types.ts`、`server/jobs/views.ts` 与路由，不另外假造 SQL DTO：

| Response 别名 | 内容 |
| --- | --- |
| `Base` | id/name/description/color/owner/access/revision；当前 tenantId 可选，不构成可信租户 |
| `Document` | id/baseId/name/category/status/type/size/owner/date/chunks/versions/department/level/strategy/stage/task/revision/source?/sourceArtifactId?；versions 含 version/date/note/chunks 及兼容 id/chunkIds |
| `TaskView` | id/docId/docName/status/stage/updatedAt/error?/supersededBy?；job 若存在只含 kind/state/version/attempts/maxAttempts；**不含输入全文/分块、checkpoint、租约 token** |
| `FileArtifact` | id/name/size/mediaType/sha256/createdAt；没有真实磁盘路径 |
| `Conversation` | id/title/createdAt/updatedAt/messages；serialize 还带 time/group。assistant 带 answerMode=rule_demo/legacy_unverified；permission.status=not_configured、checked=[]；来源有 provenance 与 verified=false；旧历史在 DTO 纠正声明但不重写原数据 |
| `Trace` | query/mode/topK/threshold/scope/stages/hits；implementation=rule_demo/legacy_unverified、timing=simulated/unverified、permissionFiltering=not_configured；规则输出及模拟耗时不是授权或真实模型凭据 |
| `Evaluation` | id/name/dataset/status/createdAt/finishedAt/metrics/records；当前指标为旧规则口径 |
| `Permissions` | departments/roles/resources/members/rules/revision；revision 对应全局规则版本 |
| `AuditDetail` | log 与 evidence；新 log 含 schemaVersion/actorKind/requestId/method/route/targetType/targetId/changedFields/outcome/errorCode，关联精确消息；旧 log 标 legacy_unverified；仍无可信身份或防篡改存储 |
| `Settings` | 现有 Settings 字段与 revision；不含 provider URL/API Key，因为这些能力尚未实现 |

## 2. 权限、幂等和错误约定

**当前所有下表业务路由均没有真实认证或后端 ACL。** “目标权限”是后续必须实现的政策，不是现状。策略由服务端用户/会话/成员关系得出，不能读取 body.owner、department、tenant 或 `permission.result` 当作授权依据。

目标权限简称：`KR/KW/KP/KM`=知识库 read/write/publish/manage；`CO`=会话所有者；`WA`=工作空间管理员；`TR/TW`=任务关联知识库 read/write；`AR`=审计读取；`MR`=模型配置使用/管理，区分普通调用与配置写入。首版有效库权限=角色能力上限∩成员显式库 grant，不支持资源级角色 grant/部门继承；WA 无自动内容读取豁免，但可显式管理本租户 grants 并留审计。跨租户的外键与查询在后端过滤；下载、会话历史和引用也须复验当前权限。

幂等简称：

- `I`：当前可选 `Idempotency-Key`，16–128 位字母/数字/`_-`；同 scope/键/输入重放已提交结果；变更输入 409；TTL 24h，上限 10,000。当前身份 scope 是占位值，**不具备用户隔离**。未来必须改为可信 tenant/user。
- `D`：文件名+内容摘要确定性去重，不使用 JSON mutation 重放；可能有孤立原件，未自动删除。
- `R`：只读；不承诺静态快照，多次读取可变化。`N`：无业务幂等保证。
- 新增侧效必须提供 I；外部副作用还要 tool operation key 和结果核对，不能只保证 HTTP 不重复插一行。

当前通用错误：400 INVALID_JSON/VALIDATION_ERROR/INVALID_IDEMPOTENCY_KEY，404 NOT_FOUND，409 REVISION_REQUIRED/VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/INVALID_STATE，413 PAYLOAD_TOO_LARGE，429 IDEMPOTENCY_CAPACITY，500 INTERNAL_ERROR。部分旧路由仍返回通用 code，具体错误字符串不作为稳定业务枚举。未来增加 401 UNAUTHENTICATED、403 FORBIDDEN、503 DEPENDENCY_UNAVAILABLE 与细分模型/工具超时码。

当前另有 400 BASE_ROUTING_UNAVAILABLE，明确拒绝未实现的 baseIds。业务写入/提交审计/幂等记录同事务式 Store 更新，重放不重复成功事件；失败写请求尽力持久化审计，存储故障时记录 AUDIT_WRITE_FAILED 且保留原 HTTP 错误。settings.audit 仅控制可选检索摘要，不关闭业务写入审计；新事件不复制请求值/全文，旧历史不自动脱敏或重写。

## 3. 当前 API 完整目录

“实现文件”使用缩写：C=`server/routes/conversations.ts`，K=`server/routes/knowledge.ts`，G=`server/routes/governance.ts`，F=`server/routes/files.ts`，A=`server/app.ts`。页面缩写均指 `src/pages/<Name>.tsx`。表中 `∅` 为无 JSON body。

| Method | Path | Request | Response | 主要额外错误/约束 | 目标权限 | 幂等 | 页面 / 实现文件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | ∅ | `{status:'ok',time}` | 当前只探活，不检查 DB/模型 | 公开探活，详细 readiness 另鉴权 | R | ConnectionStatus / A |
| GET | `/api/conversations` | query? | `{conversations:Conversation[]}` | 当前未分页、返回含消息 | CO | R | ChatPage / C |
| POST | `/api/conversations` | ConversationCreate | `{conversation}`，201 | title 校验 | 已登录 | I | ChatPage / C |
| GET | `/api/conversations/:id` | ∅ | `{conversation}` | 不存在 404 | CO，消息引用再授权 | R | ChatPage / C |
| DELETE | `/api/conversations/:id` | ∅ | `{ok:true}` | 不存在 404；前端部分失败可重试 | CO | I | ChatPage / C |
| POST | `/api/conversations/:id/messages` | MessageInput | `{userMessage,answerMessage,conversation}` | 当前规则答案；baseIds 返回 BASE_ROUTING_UNAVAILABLE；权限未配置与来源演示明确标记 | CO + KR（目标） | I | ChatPage / C |
| PATCH | `/api/conversations/:id/messages/:messageId/feedback` | Feedback | `{message}` | null 清除，不存在 404 | CO | I | ChatPage / C |
| GET | `/api/knowledge/bases` | ∅ | `{bases:Base[]}` | 未分页 | KR | R | KnowledgePage/DocumentsPage / K |
| POST | `/api/knowledge/bases` | BaseCreate | `{base}`，201 | DUPLICATE_NAME | 创建库权限/WA | I | KnowledgePage / K |
| PUT | `/api/knowledge/bases/:id` | BaseUpdate | `{base}` | revision；重名 409；原子维护关联 | KM | I | KnowledgePage / K |
| DELETE | `/api/knowledge/bases/:id` | ∅ | `{ok:true}` | RESOURCE_NOT_EMPTY；当前不要求 If-Match | KM | I | KnowledgePage / K |
| GET | `/api/knowledge/documents` | query?/status?/category? | `{documents:Document[]}` | 未分页；不能认为 limit 生效 | KR | R | DocumentsPage/OverviewPage / K |
| POST | `/api/knowledge/documents/import` | Import | `{document}`，201 | UNKNOWN_FILE/UNKNOWN_KNOWLEDGE_BASE；源文件损坏 409；解析器缺失记录任务失败 | KW | I | UploadModal / K |
| GET | `/api/knowledge/documents/:id` | ∅ | `{document}` | 404 | KR | R | DocumentsPage / K |
| PUT | `/api/knowledge/documents/:id` | DocumentUpdate | `{document}` | revision、有效 baseId | KW；移动文档需两库权限 | I | DocumentsPage / K |
| DELETE | `/api/knowledge/documents/:id` | ∅ | `{ok:true}` | 当前删除记录与任务，不物理删原件；无索引清理实现 | KW | I | 文档操作入口 / K |
| POST | `/api/knowledge/documents/:id/publish` | StateOperation | `{document}` | DOCUMENT_NOT_READY；revision | KP | I | DocumentsPage / K |
| POST | `/api/knowledge/documents/:id/archive` | StateOperation | `{document}` | revision | KP | I | DocumentsPage / K |
| POST | `/api/knowledge/documents/:id/advance` | StateOperation | 错误 | 始终 MANUAL_ADVANCE_DISABLED 409 | 不开放手动推进 | N | 旧客户端兼容错误 / K |
| POST | `/api/knowledge/documents/:id/retry` | StateOperation | `{document}` | TASK_MISSING/SOURCE_UNAVAILABLE/TASK_NOT_RETRYABLE | TW | I | 兼容入口 / K |
| PUT | `/api/knowledge/documents/:id/chunks` | ChunksUpdate | `{document,version}` | revision；CHUNK_LAYOUT_CHANGED；未变更不建版本 | KW | I | DocumentsPage / K + document-edits.ts |
| PUT | `/api/knowledge/documents/:id/chunks/:index` | ChunkUpdate | `{document,version}` | 索引无效 400、不存在 404、revision；保留原边界 | KW | I | 旧单块入口 / K |
| POST | `/api/knowledge/documents/:id/rollback` | VersionOperation | `{document,version}` | 版本不存在 404；INVALID_CHUNKS；revision | KW | I | DocumentsPage / K |
| GET | `/api/knowledge/tasks` | ∅ | `{tasks:TaskView[]}` | 不返回任务输入/lease；未分页 | TR | R | TasksPage/OverviewPage / K |
| POST | `/api/knowledge/tasks/:id/retry` | StateOperation | `{task}` | TASK_NOT_RETRYABLE/VERSION_CONFLICT/SOURCE_UNAVAILABLE | TW | I | TasksPage / K |
| POST | `/api/knowledge/tasks/:id/cancel` | StateOperation | `{task}` | TASK_NOT_CANCELLABLE | TW | I | TasksPage / K |
| GET | `/api/knowledge/tasks/:id/events` | after? 非负整数 | `{events:[{sequence,time,type,message}],state}` | after 无效 400；普通 JSON，不是 SSE | TR | R | TaskDetails / K |
| POST | `/api/knowledge/files` | FileUpload | `{artifact:FileArtifact}`，201 | EMPTY_FILE/FILE_TOO_LARGE/UNSUPPORTED_FILE_TYPE/FILE_TYPE_MISMATCH/INVALID_TEXT_ENCODING/INVALID_FILE_NAME；原件根目录不安全 FILE_STORAGE_UNSAFE 409 | 已认证+resource.upload；暂存原件只归上传者，附加文档时另验 KW | D，未来必须绑定真实上传主体 | UploadModal / F |
| GET | `/api/knowledge/files/:id/download` | ∅ | attachment 字节流 | 未关联 404；SOURCE_UNAVAILABLE/FILE_INTEGRITY_ERROR/FILE_STORAGE_UNSAFE 409 | 对关联文档 KR | R | DocumentsPage / F |
| POST | `/api/retrieval/search` | Retrieval | `{trace:Trace}` | baseIds 返回 BASE_ROUTING_UNAVAILABLE；当前规则评分/模拟耗时；可选检索摘要 | KR 及逐候选过滤 | I 仅现有审计写，不是稳定查询快照 | RetrievalPage / G |
| GET | `/api/evaluations` | ∅ | `{evaluations:Evaluation[]}` | 未分页 | WA 或评测读取角色 | R | EvaluationPage / G |
| GET | `/api/evaluations/:id` | ∅ | `{evaluation}` | 不存在 404 | 同上 | R | EvaluationPage / G |
| POST | `/api/evaluations` | EvaluationCreate | `{evaluation}`，201 | 仍同步旧规则集，不是 LLM 评测 | 评测执行权限+KR | I | EvaluationPage / G |
| GET | `/api/permissions` | ∅ | Permissions | 全局矩阵非资源 grants；revision 是规则版本 | WA | R | PermissionsPage / G |
| POST | `/api/permissions/members` | MemberCreate | `{member}`，201 | DUPLICATE_EMAIL；不创建可登录账户 | WA | I | PermissionsPage / G |
| PUT | `/api/permissions/members/:id` | MemberUpdate | `{member}` | revision、LAST_ADMIN、DUPLICATE_EMAIL | WA | I | PermissionsPage / G |
| DELETE | `/api/permissions/members/:id` | `If-Match:<revision>` | `{ok:true}` | LAST_ADMIN、版本冲突 | WA | I | PermissionsPage / G |
| PUT | `/api/permissions/rules` | RuleUpdate | `{key,values,revision}` | revision；仍是固定行矩阵 | WA | I | PermissionsPage / G |
| GET | `/api/audit` | query?/action? | `{logs:AuditLog[]}` | 无时间范围/actor/cursor 参数实现 | AR | R | AuditPage / G |
| GET | `/api/audit/:id` | ∅ | AuditDetail | 404；历史证据不等于授权证明 | AR+来源资源过滤 | R | AuditPage / G |
| GET | `/api/settings` | ∅ | `{settings}` | 含 tenant 名称但非身份隔离 | 配置读取角色 | R | SettingsPage / G |
| PUT | `/api/settings` | SettingsUpdate | `{settings}` | revision、TENANT_IMMUTABLE/参数范围；不能配置真实密钥 | WA | I | SettingsPage / G |
| GET | `/api/overview` | ∅ | `{stats,latestEvaluation}` | 统计为当前 JSON 记录数，非模型健康或真实容量 | 已登录，按可见范围聚合 | R | OverviewPage / G |

当前 `grantsInput` 虽存在于 `shared/contracts.ts`，校验中也预留路径，但没有匹配的业务路由；因此资源成员管理属于 NEW，不能算现有 API。成功响应必须等实际保存完成；metadata 上传成功不表示 parser/index 完成。

## 4. NEW 身份、权限、模型与文档增量

以下 JSON 为候选 Schema，采用现有 Hono/Zod/TS 风格；落地时生成共享 Schema 与接口文档。所有 tenant/actor 来自服务端 session，禁止客户端指定任意 tenantId。NEW 目录/文件尚不存在。

```ts
type Login = { email: string; password: string }; // 本地登录分支，需选择
type Me = { user: { id: string; name: string }; tenant: { id: string; name: string }; permissions: string[] };
type Grants = { revision: number; grants: Array<{ memberId: string; permissions: Array<'read'|'write'|'publish'|'manage'> }> };
type ModelConfigWrite = {
  name: string; purpose: 'llm'|'embedding'|'rerank'; provider: string;
  model: string; baseUrl?: string; secretRef: string; revision?: number;
};
type ModelConfigView = Omit<ModelConfigWrite,'secretRef'> & { id: string; configured: boolean; status: 'untested'|'ready'|'failed' };
type Reindex = { versionId: string; profileId: string; revision: number };
type VersionCitation = { documentId: string; versionId: string; chunkId: string; locator: { page?: number; start?: number; end?: number } };
type DatasetWrite = { name: string; samplesArtifactId: string; schemaVersion: 1 };
type EvalCreate = { datasetId: string; retrievalProfileId: string; modelConfigId?: string };
```

| Method | NEW Path | Request → Response | 错误 | 权限 / 幂等 | 页面 / 拟实现文件 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | Login → Me + HttpOnly session cookie | INVALID_CREDENTIALS 401；限流 429；统一错误避免账号枚举 | 匿名入口，限速；不重放凭据结果 | LoginPage / NEW `server/routes/auth.ts`、`server/auth/session.ts` |
| GET | `/api/auth/me` | ∅ → Me | 401/租户不可用 403 | session；R | WorkspaceProvider / 同上 |
| POST | `/api/auth/logout` | ∅ → `{ok:true}`、撤销 session | CSRF 403 | session；幂等撤销 | Topbar / 同上 |
| GET | `/api/auth/oidc/start` | returnTo 仅本地相对路径 → 302 | INVALID_RETURN_TO | 仅选定 OIDC 分支；state/nonce/PKCE 技术验证 | LoginPage / NEW `server/auth/oidc.ts` |
| GET | `/api/auth/oidc/callback` | code/state → session/本地跳转 | OIDC_STATE_INVALID/IDENTITY_REJECTED | 绑定一次性登录状态，不信任 email 自动授管理员 | 同上 |
| GET | `/api/knowledge/bases/:id/grants` | ∅ → Grants | 401/403/404 | KM 或 WA；R | KnowledgePage/PermissionsPage / K + NEW `server/auth/policy.ts` |
| PUT | `/api/knowledge/bases/:id/grants` | Grants → Grants | VERSION_CONFLICT/UNKNOWN_PRINCIPAL/GRANT_EXCEEDS_ROLE | KM 或 WA；I；撤权提升 authzVersion；只支持 memberId | 同上 |
| GET | `/api/model-configs` | purpose? → `{configs:ModelConfigView[]}` | 401/403 | MR；R，禁止 secretRef/密钥回传 | SettingsPage / NEW `server/routes/models.ts` |
| POST | `/api/model-configs` | ModelConfigWrite → `{config:ModelConfigView}` | PROVIDER_NOT_ALLOWED/INVALID_SECRET_REF | WA；I | 同上 |
| PUT | `/api/model-configs/:id` | ModelConfigWrite+revision → config view | VERSION_CONFLICT/SSRF_DESTINATION_DENIED | WA；I | 同上 |
| POST | `/api/model-configs/:id/test` | ∅ → `{status,capabilities,measuredMs,requestId}` | MODEL_TIMEOUT/MODEL_AUTH_FAILED/UNSUPPORTED_CAPABILITY | WA；I，真实调用可能计费，按批准预算执行 | 同上 + NEW `server/models/provider.ts` |
| POST | `/api/knowledge/documents/:id/reindex` | Reindex → `{task,generationId}`，202 | VERSION_CONFLICT/MODEL_NOT_READY | KW；I；同版本/profile 复用进行中 generation | DocumentsPage/TasksPage / K + NEW `server/rag/indexer.ts` |
| GET | `/api/knowledge/documents/:id/index-generations` | ∅ → `{generations:[{id,versionId,profileId,state,error?}]}` | 401/403/404 | KR；R | DocumentsPage / 同上 |
| GET | `/api/citations/:chunkId` | versionId → `{citation:VersionCitation,excerpt,sourceDownload?}` | CITATION_STALE/SOURCE_UNAVAILABLE/403 | KR，按当前授权复验；R | 证据面板 / NEW `server/routes/citations.ts` |
| POST | `/api/evaluation-datasets` | DatasetWrite → `{dataset:{id,name,count,schemaVersion}}` | INVALID_DATASET/UNKNOWN_ARTIFACT | 评测管理角色；I | EvaluationPage / NEW `server/routes/evaluation.ts` |
| POST | `/api/evaluation-runs` | EvalCreate → `{run:{id,state}}`，202 | DATASET_NOT_FOUND/MODEL_NOT_READY | 评测执行+KR；I | EvaluationPage/TasksPage / 同上 |
| GET | `/api/evaluation-runs/:id` | ∅ → `{run,metrics,sampleResults}` | 403/404 | 评测读取+KR；R | 同上 |
| GET | `/api/readiness` | ∅ → `{ready,dependencies:[{name,status}]}` | 503 不就绪 | 详细依赖仅运维角色；公开只布尔值 | 状态页/部署 / A |

P3 对当前 `/api/knowledge/documents/:id/publish` 升级为明确请求 `{revision,versionId,generationId}`：必须 KP，版本/generation 同属文档且 ready，事务切换 published 指针并审计。编辑和 reindex 只有 KW，均不能自动激活公开版本；旧无目标请求明确拒绝，调用方同批更新。当前原型接口仍是上节的 StateOperation，没有提前实现该协议。

新增 list 接口采用 `{items,nextCursor?}`，cursor 绑定 tenant、查询条件和排序键；旧 list 增加可选 cursor/limit 时保留原集合字段并补 nextCursor。不得在未实现服务端分页时返回伪造总页数。审计新增 from/to/actor/outcome/cursor 需校验时区、范围、权限；当前旧接口只实现 query/action。

## 5. NEW 问答执行与单 Agent API

持久化 generation/run 后订阅事件，避免把连接断开当作业务取消；显式 cancel 才变更状态。JSON 与 SSE 使用相同顺序事件，重连携带 cursor/Last-Event-ID；处理重复 sequence 而不是重复追加消息。

```ts
type GenerationCreate = {
  content: string; baseIds: string[]; modelConfigId: string;
  retrievalProfileId: string; multiTurn: boolean;
};
type AgentTaskCreate = { title?: string; instruction: string; baseIds: string[]; skillIds: string[]; attachmentIds?: string[] };
type RunCreate = { taskRevision: number; modelConfigId: string; maxSteps: number; budget: { maxTokens: number; timeoutMs: number } };
type RunEvent = { sequence: number; time: string; runId: string; type: string; stepId?: string; data: unknown }; // data 需按事件类型严格化/脱敏
type ApprovalDecision = { revision: number; decision: 'approve'|'reject'; argumentsHash: string };
type RetryRun = { failedStepId: string; checkpointId: string; revision: number };
type ArtifactView = { id: string; name: string; mediaType: string; size: number; sha256: string; createdAt: string };
```

| Method | NEW Path | Request → Response | 错误 | 权限 / 幂等 | 页面 / 拟实现文件 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/conversations/:id/generations` | GenerationCreate → `{generationId,userMessageId,state}`，202 | MODEL_NOT_READY/EMPTY_AUTHORIZED_CONTEXT | CO+KR+模型使用；I | ChatPage / C + NEW `server/chat/generation.ts` |
| GET | `/api/generations/:id/events` | after?/SSE header → RunEvent[] 或 SSE | CURSOR_INVALID/403/404 | CO+来源授权；R | ChatPage / NEW `server/routes/generations.ts` |
| POST | `/api/generations/:id/cancel` | revision → `{state}` | INVALID_STATE | CO；I | 同上 |
| POST | `/api/conversations/:id/messages/:messageId/regenerate` | modelConfigId/retrievalProfileId → generation ref | STALE_MESSAGE/MODEL_NOT_READY | CO+KR；I，保留原消息版本 | 同上 |
| POST | `/api/agent/tasks` | AgentTaskCreate → `{task:{id,revision,state}}`，201 | INVALID_SKILL/UNKNOWN_ATTACHMENT/403 | 已登录+KR；I | NEW AgentPage / NEW `server/routes/agent.ts` |
| GET | `/api/agent/tasks` | cursor?/limit? → `{items,nextCursor?}` | CURSOR_INVALID | 仅任务所有者/授权管理员；R | 同上 |
| GET | `/api/agent/tasks/:id` | ∅ → `{task,runs}` | 403/404 | 同上；R | 同上 |
| POST | `/api/agent/tasks/:id/runs` | RunCreate → `{run:{id,state,revision}}`，202 | TASK_VERSION_CONFLICT/BUDGET_EXCEEDED/MODEL_NOT_READY | 任务所有者+KR+工具能力；I | AgentPage / NEW `server/agent/runtime.ts` |
| GET | `/api/agent/runs/:id/events` | after?/SSE → 有序 RunEvent | CURSOR_INVALID/403 | 任务授权，输出脱敏；R | AgentPage / NEW agent.ts |
| POST | `/api/agent/runs/:id/cancel` | revision → `{run}` | INVALID_STATE/EXTERNAL_RESULT_UNKNOWN | 任务所有者；I，不等于撤回已完成外部侧效 | 同上 |
| POST | `/api/agent/runs/:id/retry` | RetryRun → `{run}`，202 | CHECKPOINT_INCOMPATIBLE/RESULT_RECONCILIATION_REQUIRED | 所有者+权限复验；I；从明确 checkpoint 恢复 | 同上 |
| POST | `/api/agent/approvals/:id/decision` | ApprovalDecision → `{approval,state}` | APPROVAL_EXPIRED/ARGUMENTS_CHANGED/ALREADY_DECIDED/FORBIDDEN/NO_ELIGIBLE_APPROVER | tool.approve+目标动作权限；站内白名单可明确自批，外部写需 different_member；I；执行前复验 | AgentPage / NEW `server/agent/approvals.ts` |
| GET | `/api/agent/runs/:id/artifacts` | ∅ → `{artifacts:ArtifactView[]}` | 403/404 | 任务/来源授权；R | AgentPage / NEW agent.ts |
| GET | `/api/agent/artifacts/:id/download` | ∅ → attachment 字节流 | SOURCE_UNAVAILABLE/FILE_INTEGRITY_ERROR/403 | 产物可见+当前来源授权；R | 同上，复用原件存储能力 |
| GET | `/api/agent/tools` | ∅ → `{tools:[{name,version,inputSchema,outputSchema,sideEffect,approvalRequired}]}` | 401/403 | 只列当前用户可用工具，注册表不是执行授权 | AgentPage / NEW `server/agent/tools.ts` |
| GET | `/api/agent/skills` | ∅ → `{skills:[{id,version,name,description}]}` | 401/403 | 只列已批准发布的 Skill | AgentPage / NEW `server/agent/skills.ts` |

不提供任意执行 shell、任意 URL 抓取、任意 MCP server 动态连接或前端直接 call tool 接口。Agent 只能请求已注册工具；Runtime 决定权限、审批、幂等和预算。审批不是通用授权 token，模型不能通过填写 approved=true 绕过。

## 6. 协议验收与兼容策略

1. 当前 strict Schema 新增字段需前后端同批发布；旧 `/chunks/:index` 保留。file 导入当前已经要求 artifactId，这是已发生的兼容变更，见 P2 记录。
2. 身份启用时不把旧成员直接赋登录权限；提供明确 bootstrap/映射流程。业务 API 默认拒绝未认证，演示模式保持显式隔离，不能因 401 回退演示成功。
3. baseIds 未来必须落到后端授权库集合；当前已返回明确 BASE_ROUTING_UNAVAILABLE，不静默忽略。scope 名称只是兼容筛选，不参与授权。
4. 真问答/再生成采用新持久 generation 协议，不把原固定回答接口改成无法解析的混合 SSE JSON。保留原消息、来源与反馈关联。
5. 每个新增写端点必须覆盖：无 session、越权、校验错、过期 revision、重复/冲突 key、落盘失败、重启重放；事件/下载另测撤权后不可见与敏感字段不出响应。
6. 前端从 HTTP 码/code/requestId 展示错误，不依据“成功”字符串判断。真实模型、异步任务、侧效工具必须用持久终态表示完成；202 仅表示已接受。
7. 身份接入后，上传记录绑定 uploader；暂存原件只能由上传者引用。附加到文档时必须同时具备目标库 KW 与该原件的引用权限，不能凭 artifactId 复制其他用户的文件。去重 ID/唯一约束增加可信 tenant/uploader 作用域；物理 blob 可以复用摘要，但不能共享原件元数据所有权。
