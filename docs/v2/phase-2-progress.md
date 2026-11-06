# P2 可靠性进展与验收记录

日期：2026-11-06。状态：**部分完成，P2 仍在进行**。已实现 PostgreSQL、本地登录/改密/会话、成员库授权与前端闭环，并在隔离环境验证；完整存量映射、正式迁移/切换回滚、留存及生产安全验收未完成。当前交付详情与精确文件清单见 [身份与授权记录](local-auth-access.md)。默认 JSON 兼容模式仍未认证，不与 SQL 认证模式混为一谈。

系统基线与后续设计补充：[全项目审查](phase-0-system-audit.md)、[API 目录](target-api-catalog.md)、[候选数据与单 Agent 设计](target-data-agent-design.md)。它们补齐快照/当前能力区分、问题表、十页矩阵、文件级路线、验收矩阵与架构决策；设计中的 NEW 不是本轮业务实现，不能作为 P2/P3/P4 已完成证据。

Git 审查基线：`main` / `7c8e15d744223fd29114aed7625e0c1025bc59bc`；`snapshot-2026-11-06^{commit}` 指向该基线（标签对象与 Commit 的 SHA 不同是正常情况）。本次按用户要求将 P1/P2 增量纳入新的代码交付，保留原快照标签；未执行生产部署。用户原有备份 `zhixu-offline-server.mjs.bak` 未读取或改动，也不纳入提交。

已用 `git ls-remote --tags origin` 核验 GitHub 上的原快照：标签对象为 `6c7270399217bb85a43f35e127b2d2fdf873e238`，解引用为上述 `7c8e15d` Commit，与本地完全一致。本轮优化通过后续提交交付，不移动或覆盖原始快照标签；实际提交与远端状态以 Git 历史为准。

## 已实现范围与设计决策

| 原问题 | 本轮处理 | 实际边界 |
| --- | --- | --- |
| JSON 解析失败被吞没、参数未统一校验 | `shared/contracts.ts` 与 `server/http/validation.ts` 严格校验现有 JSON 写接口；拒绝未知字段、错误类型与越界数值 | 不是完整的双向 OpenAPI 契约；成功响应仍沿用原有域对象封装 |
| 错误与日志缺少关联 | `server/http/errors.ts` 统一错误码、requestId 和耗时日志；日志使用路由模板，不含参数值/查询/正文；内部错误不返回堆栈 | 无集中日志平台或完整权限决策审计 |
| 请求体无统一上限、任意 Origin 反射 | 请求体限制 24MB、CORS 白名单；SQL 写请求另有 Origin/CSRF | JSON 兼容模式仍无身份，CORS 本身不是授权 |
| 路由直接依赖 JSON 实现 | StateRepository、SQL 事务/tenant 锁、显式认证入口与可见投影 | 未生产切换，快照回调尚未演进为大数据分页 SQL 查询 |
| 编辑覆盖并发结果，历史分块被引用复用污染 | revision 检查；历史快照复制；版本/分块 ID；保留版本主版本号 | 旧数据按读取补充兼容字段；未执行批量数据迁移 |
| 多分块逐次写入产生半成功，重切已有重叠分块会重复内容 | 一次批量 mutation 提交全部编辑、一个版本及一个 `validate_chunks` 任务；保留精确分块与空白 | 旧单分块路由保留；尚无真实索引版本切换 |
| 知识库按名称关联，改名后文档脱离 | 原子更新相关文档并补充稳定 baseId；非空库禁止删除 | 存量无 baseId 的文档仍按名称兼容解析 |
| 文件选择只登记文件名和大小 | multipart 真实传输、内容摘要寻址、原件/版本关联、下载完整性检查、进度及取消；UTF-8 TXT/Markdown 入队切分 | 其他格式不解析；无杀毒或完整格式校验，上传/下载 ACL 仍待接入 |
| 浏览器状态被误当作后台执行完成 | 同进程 worker 执行真实保存文本的校验和固定长度分块，持久化状态与事件 | 不做二进制解析、OCR、向量化、语义/父子分块或索引 |
| 请求超时重试产生重复写入 | 业务变更和幂等重放结果在同一 Store 更新内提交；前端保留失败请求的操作键 | 认证主体仅预留接缝；不能宣称租户或用户安全隔离 |
| 未完成文档可发布/检索 | 发布检查完成状态和非空文本；检索排除草稿和处理中记录 | 规则检索仍无后端 ACL，也不是真实 RAG |
| 设置和成员配置可互相覆盖 | 设置、成员、权限规则 revision；邮箱大小写去重；最后管理员保护；普通设置接口禁止更改 tenant | 成员仍为配置记录，不是可登录账户 |
| 审计展示构造的权限证据 | 保存并展示实际会话、消息和请求关联 | 不把已有 permission 字段当作授权成功凭据 |
| 参数被静默忽略、ID 随机空间不足 | baseIds 返回 400 BASE_ROUTING_UNAVAILABLE；新业务 ID 使用 UUID，保留旧 ID | 尚未实现真正多库路由；JSON 还没有数据库唯一约束 |
| API 仍声称权限通过/来源已核验 | JSON 标 not_configured；SQL 按实际后端校验标 enforced；来源仍为 demo/unverified | 真实引用/模型未实现，不把登录成功当 RAG 完成 |
| 审计依赖硬编码人名、缺少变更留痕 | 成功业务/身份变更各在同一事务留痕；补充 HTTP 拒绝/状态日志关联 requestId | SQL 主体可信，JSON 仍匿名；工具审计、防篡改与留存未闭环 |
| 缺少独立、只读的数据迁移前检查 | 显式输入副本的 CLI 检查结构、重复 ID、文档/版本/任务关系和原件字节，输出脱敏 JSON 与明确退出码 | 不修复数据；不代表 SQL dry-run、可信身份/授权映射或迁移就绪 |
| 原件读取追随符号链接，大小检查与读取分离 | 拒绝原件根目录/叶子链接；同句柄检查普通文件、前后状态及摘要，按已验证大小限制读取；写入前核对字节与摘要 | 不提供对恶意并发替换父目录的沙箱；原件 root 本身需为实际目录 |
| 已有 JSON 缺少根字段时被 seed 补齐，配置数组被当作对象 | 已有文件不再与 seed 合并；七组必需集合与 settings/rules 根类型无效即停止加载及 mutation | 仅作根结构及原件元数据防护，不是全部存量业务字段的完整 Schema 校验 |

继续复用 React / TypeScript / Vite / Hono / 原生 CSS。增加 Zod 请求校验依赖；没有更换数据库或引入 Agent 框架。验证环境为 Node.js 24.21.0；README 已修正旧版 Node 推荐，锁定测试依赖需 Node.js 22.22.2+ 或 24.15+ 的受支持版本。

## 任务执行与恢复

`server/jobs/queue.ts` 将 `prepare_text` 和 `validate_chunks` 任务保存在原 JSON 状态中，包含输入文本或编辑分块快照、分块参数、版本、尝试次数、租约、检查点和有序事件。

状态为 `queued → running → succeeded`；失败可进入 `retry_wait` 或 `failed`，取消进入 `cancelled`。队列提供最大次数和退避机制；当前文本处理器的校验/配置错误按不可重试错误处理，不会无限自动重试。未来外部依赖错误还需显式分类与验证。

- 每次领取产生租约 token；过期任务可重新领取，旧 token 不能提交。
- `parsed` 表示文本已校验，`chunked` 表示固定长度分块检查点，不代表文件解析或向量索引。
- 文档版本改变或任务取消后，旧执行结果不能提交；完成写入同时提升文档 revision。
- 编辑和回滚任务直接校验保存的分块，保留其边界、重叠文本及前后空白，不再把重叠分块拼接后重新切分。历史任务重新处理也使用分块校验。
- 旧任务只有存在可处理文本时才能重试；转换为新版本/新任务并记录 `supersededBy`。
- 列表响应隐藏输入全文、检查点内容和租约 token；事件是普通 JSON 增量读取，不是 SSE。
- worker 与 API 共享同一 Store 实例。**禁止单独启动第二个 JSON worker 或多个服务实例写同一文件。**
- SIGTERM/SIGINT 停止领取并等待当前执行；退出等待上限 20 秒。尚未做真实进程被杀后的部署级恢复试验；已有临时文件持久化重启和租约恢复测试。

JSON 写入使用独立临时文件、0600 权限和 rename，写成功后才发布内存状态；这不等同于数据库事务、跨进程安全或断电持久性保证。

`shared/text-limits.ts` 限制一次最多 10,000 个分块、单块最多 100,000 个 UTF-16 码元、总分块最多 8,000,000 个码元。固定长度切分在生成前以保守上界检查重叠膨胀，过大时持久化 `CHUNK_EXPANSION_LIMIT` 失败，不覆盖已保存内容。这些是当前单进程 JSON 的资源保护上限，不是测量所得的吞吐或延迟目标；性能基线尚未建立。

文档编辑一次提交全部分块，只生成一个版本和一个后台校验任务；未修改的批量保存不增加版本。客户端在失败或外部 revision 更新后保留草稿，明确确认后才丢弃。设置、分块和授权表复用导航/卸载确认。JSON 由同一 Store mutation 保证；SQL 由数据库事务、tenant 锁与事务内授权复验保证。SQL 普通读者看显式发布的版本及元数据，worker 完成不会自动切公开指针。

## 原文件生命周期

`server/services/files.ts` 将真实上传字节保存至 `DATA_DIR/files/<sha256>`，文件名不参与磁盘路径；私有目录 0700，文件 0600。上传先写独立临时文件再 rename，随后原子保存 JSON 元数据。相同文件名和内容复用 artifactId；不同名字可指向相同内容对象。元数据写失败返回 500；已落盘但未登记的孤立原件保留，重试可恢复，不伪造成功。

- 一次请求只接受一个 `file`，上限 20 MB；批量由前端逐项上传/导入，导入失败重试复用该弹窗中已上传的 artifact，并跳过已完成文档。
- 允许 TXT/Markdown、PDF、Office 与常见图片。TXT/Markdown 必须是非空 UTF-8 文本，最多 200 万字符；二进制检查轻量文件签名。Office 只检查 ZIP/复合文档容器，不表示完整格式有效或无恶意宏。没有解压或杀毒，不声称防住全部恶意文件。
- import 的 file 模式必须引用实际存在且通过完整性检查的 artifactId，不能只提交名称伪装成上传。原件 ID 保存于文档和初始版本，后续内容版本保留原始来源关联。
- UTF-8 TXT/Markdown 保存输入和参数后入队；其他文件明确以 `PARSER_UNAVAILABLE` 记录未完成，前端禁用无效重试。网页登记以 `FETCHER_UNAVAILABLE` 说明抓取未实现。历史记录未批量迁移。
- 下载前校验长度和 SHA256，使用 attachment、nosniff、no-store；仅能下载仍被文档或版本引用的原件。不存在或损坏返回明确错误，前端保留预览并提示。
- 未完成导入、取消上传或进程崩溃可能留下孤立文件；目前无自动清理或保留期策略。删除文档不会自动物理删除原件，避免共享内容对象与用户数据被误删。
- JSON 模式的关联检查不是 ACL；SQL 模式已依据会话/库授权检查原件所有权、关联版本与下载，不能凭 artifactId 附加其他用户的暂存原件。

## API 契约与前端影响

错误体为 `{ error, code, requestId, details? }`，响应头包含 `X-Request-ID`。成功体保留原接口封装，避免无必要的大规模改动。

新增 `BASE_ROUTING_UNAVAILABLE`：问答与检索请求一旦显式携带 baseIds（含空数组）就返回 400，不再接受后静默忽略。现有 scope 仍仅是规则筛选，不是访问授权。新 createId 采用 `${prefix}-${UUID}`，旧 b1/d1、原消息等 ID 保持可读，不迁移或重写已有数据。

消息响应保留 answerMode=rule_demo/legacy_unverified，来源 provenance=demo/legacy_unverified、verified=false，计时 simulated/unverified。JSON permission 与 trace 仍为 not_configured；SQL 按当前授权投影生成 enforced DTO，撤权后的历史召回脱敏。幂等重放也复验授权并做响应投影，不把规则答案/固定来源升级为真实 RAG。

| HTTP / Path | 请求与响应要点 | 前端/实现 |
| --- | --- | --- |
| `PUT /api/knowledge/bases/:id` | 修改字段及 revision；返回 base；改名同步文档 | `useKnowledgeBases.ts` / `server/routes/knowledge.ts` |
| `POST /api/knowledge/files` | multipart 的单个 file；返回 `{ artifact: { id, name, size, mediaType, sha256, createdAt } }`；同名同内容去重 | `UploadModal.tsx`、`src/lib/upload.ts` / `server/routes/files.ts` |
| `GET /api/knowledge/files/:id/download` | 下载已关联文档的原件；返回 attachment 字节流；缺失/损坏 409，未关联 404 | 文档预览 / `server/routes/files.ts` |
| `POST /api/knowledge/documents/import` | mode=text 必须非空 text；mode=file 必须 artifactId；返回 document，文本后台准备 | `UploadModal.tsx` / `server/routes/knowledge.ts` |
| `PUT /api/knowledge/documents/:id` | 元数据及 revision；返回 document | `DocumentsPage.tsx` / 同上 |
| `PUT /api/knowledge/documents/:id/chunks` | chunks、revision；一次保存所有编辑，数组长度需与当前布局一致；返回 document、version | `useKnowledge.ts`、`DocumentsPage.tsx` / `server/routes/knowledge.ts`、`server/services/document-edits.ts` |
| `PUT /api/knowledge/documents/:id/chunks/:index` | 保留旧路径；content、revision；保留分块边界并校验 | 旧客户端兼容 / 同上 |
| `POST /api/knowledge/documents/:id/rollback` | version、revision；生成当前新版本，不覆写历史快照 | 文档历史 / 同上 |
| `POST .../documents/:id/publish`、`.../archive` | revision；发布要求文本已完成且非空 | 文档列表 / 同上 |
| `POST .../documents/:id/advance` | 返回 `MANUAL_ADVANCE_DISABLED`，禁止伪造进度 | 保留路径，停止手动模拟 |
| `POST /api/knowledge/tasks/:id/retry`、`.../cancel` | 可发送空对象；返回 task；状态不允许时 409 | `TasksPage.tsx` / 同上 |
| `GET /api/knowledge/tasks/:id/events?after=N` | 非负整数游标；返回 events、state | `TaskDetails.tsx` / 同上 |
| `PUT /api/settings` | 修改字段及 revision；返回 settings；禁止改变 tenant | `useSettings.ts` / `server/routes/governance.ts` |
| `PUT /api/permissions/members/:id` | 修改字段及 revision；返回 member | `usePermissions.ts` / 同上 |
| `DELETE /api/permissions/members/:id` | `If-Match: <revision>`；返回 ok | 同上 |
| `PUT /api/permissions/rules` | key、values、revision；读取 permissions 获取 rulesRevision | 同上 |

版本缺失返回 `409 REVISION_REQUIRED`，冲突返回 `409 VERSION_CONFLICT`；刷新并比较后重新提交，不能自动覆盖。校验错误为 400，资源不存在为 404；其余域错误以实际路由 code 为准。

JSON 写接口可使用 `Idempotency-Key`（16–128 位字母、数字、短横线或下划线）。相同作用域、键和规范化输入重放结果；不同输入返回 `409 IDEMPOTENCY_CONFLICT`。记录有效期 24 小时，上限 10,000 条，达到上限返回 429。指纹包含 method、path、body 和 If-Match。multipart 文件上传采用内容寻址去重，不使用这套 JSON 重放记录。

前端对失败请求复用键，收到有效成功响应才释放；sessionStorage 只存摘要及键。JSON scope 使用认证占位值；SQL scope 使用可信 tenant/user，并在事务锁内复验当前 session/grants 后才运行/重放。新增 auth 账户/授权管理写入尚未引入通用重放：账户通过邮箱唯一性防重复，grant/member 更新通过 revision，网络结果不确定时需刷新核对。

## 操作审计闭环及限制

`server/services/audit.ts` 记录 schemaVersion、actorKind、统一 requestId、路由模板、目标 ID、字段名、结果码及消息关联。JSON 主体 anonymous；SQL 从真实 session/事务校验取得 user ID/显示名并标 enforced；不读取自称身份 header。系统任务为 system，旧未核验记录不认领。身份事件另存 auth_events，审计页展示账户/授权与 HTTP 拒绝记录，不保存密码/token/正文。

- 成功 JSON mutation 的业务状态、提交审计及可选幂等记录原子提交；同一幂等重放不新增成功事件。上传记录只在第一次登记时留创建事件，重复内容重传复用记录；后台文本任务终态与对应状态一同保存。
- POST/PUT/PATCH/DELETE 的失败响应保留 requestId、HTTP 状态及与响应一致的错误码；不把失败输入中的猜测资源 ID 当成真实资源关联。失败消息不计入“今日已保存问答”。
- 存储不可用时，业务成功不能返回；失败审计采用单独的尽力提交。若仍无法写入，输出不含内部详情的 AUDIT_WRITE_FAILED，保留原 HTTP 错误。这不保证故障时有独立持久审计介质。
- 新记录不保存问题/文档全文、名称/邮箱/owner 输入值、Authorization header 或密钥；旧历史不被自动重写，旧原始字段仍需后续访问控制与留存/脱敏政策。GET 成功/拒绝访问、MCP/工具执行尚无全量审计。
- `settings.audit` 现在控制可选的“检索请求摘要”；业务写入和失败写请求的审计始终记录。界面文案已同步，不再承诺保存模型上下文。开启此选项也不保存查询全文。
- 审计页可按记录/资源/请求 ID 搜索，并展示 SQL 身份事件。JSON 及当前 SQL 实现均不是防篡改审计平台；专用数据库角色、留存与工具审计仍待完成。

## 数据只读预检

`npm run --silent data:check -- --input /path/to/snapshot-copy/db.json --files-dir /path/to/snapshot-copy/files` 必须显式指定停写后的完整副本，不读取默认 DATA_DIR，不调用 Store，也不写入、初始化或清理来源。原件检查摘要与长度，拒绝叶子符号链接；来源变动或未完成核验会明确报告。它不提供运行中一致性快照或恶意并发目录替换的安全沙箱。

退出码 0 表示指定完整性检查无 error，仍可能有 warning；1 为完整性失败；2 为参数错误或检查未完成。报告始终标记 `migrationReady: not_assessed`，未知身份、资源授权映射及 SQL 事务 dry-run 仍待处理。输出只含固定问题码、位置、计数和输入摘要，不回显业务正文或名称。

本轮只运行临时测试夹具和仓库公共 seed 副本，未读取用户运行时数据。实际 CLI 示例为 0 error、40 warning，包括旧关系、缺原件、旧版本/分块 ID、旧任务无 job 和身份待映射；不能用作用户数据健康结论。用法、预算、示例与回滚见 [数据预检说明](data-preflight.md)。

## 原件读取修复

本次继续检查时，隔离 API 用例证实：原件叶子或原件根目录被换为符号链接，即使目标位于原件目录之外，原下载仍返回 200；旧实现 stat 后再 readFile，也无法限制检查后增长的文件读取。

`server/services/files.ts` 现用 O_NOFOLLOW/O_NONBLOCK 打开原件，以同一个句柄验证普通文件类型、大小、读取前后状态及 SHA256；只分配元数据所列且不超过 20 MB 的读取空间。原件根目录直接为符号链接、叶子为符号链接或其他非普通文件时拒绝访问，返回 409 FILE_STORAGE_UNSAFE；原有 SOURCE_UNAVAILABLE 和 FILE_INTEGRITY_ERROR 语义保留。上传写入前核对长度/摘要，不允许错误字节替换相同 digest 的原件。

本次修改业务文件仅 `server/services/files.ts`，测试为 `tests/api/files.test.ts`，没有路由、数据库或前端改动。新增三项回归覆盖叶子链接、根目录链接对下载/上传的拒绝、错误字节写入不破坏原件及超预算元数据拒绝。先运行两个链接用例得到 200→409 断言失败，再修复并跑全量回归；定向运行时其他测试未被选中，最终全量运行无跳过。

兼容性：使用符号链接作为 `DATA_DIR/files` 根目录的配置需改为实际目录；不会自动搬移原件。父目录系统别名不作递归拒绝。本实现不承诺抵御拥有文件系统写权限者并发替换整个目录，不等同杀毒、ACL 或操作系统沙箱。测试仅使用临时数据/原件，未触及用户数据或备份。

## 已有 JSON 的 seed 隔离修复

继续核验 F02 时，两个隔离测试复现：删除已有 JSON 的必需根字段，Store.load 仍成功并返回 seed 中的记录；settings/rules 为数组也通过 typeof object 检查。这会让下一次无关写入将演示记录持久化，掩盖缺字段故障。

本次业务改动仅 `server/lib/store.ts`：seed 只用于文件不存在时初始化，不再与已有文件合并。已有文件缺少七组必需集合或缺少/错误类型的 settings/rules 时拒绝加载，update 不调用 mutation，也不写回。有效空集合保持为空，未知根字段保留，files/idempotency/revision 等可选字段不强行补入。

`tests/api/store.test.ts` 新增三项回归，逐个覆盖九个必需根字段缺失、两组配置为数组，以及空集合/未知字段/可选字段的读写重启保留；先复现两项失败，再修复并全量验证。仅操作临时夹具，未检查或修改用户运行数据。这不是自动修复或完整数据库 Schema 校验，深层业务关系仍使用只读预检及后续 SQL 约束验证。

兼容性：依赖 seed 补齐缺失必需集合的旧文件现在会拒绝加载；应保留原件与 JSON 备份，在独立副本确认缺失原因和恢复方案，不能默认填演示数据。无缺字段的旧文件和可选字段缺省行为仍兼容。回滚仅撤回 store.ts、对应测试及文档差异，无数据迁移，但会恢复隐式合并的缺陷。

## 实际修改文件（相对 P1）

以下清单依据 P2 前的 P1 文件备份及本轮源码核对；不是相对 Git HEAD 的完整清单，后者还包含 P1。

修改：

- `package.json`、`package-lock.json`：增加 Zod 依赖；本次另加 data:check 命令，无新增依赖。
- `server/tsconfig.json`：将 CLI scripts 纳入常规类型检查。
- `server/app.ts`、`server/index.ts`、`server/lib/store.ts`。
- `server/lib/util.ts`、`src/lib/chat-data.ts`、`src/features/audit/types.ts`、`src/features/audit/useAudit.ts`、`src/pages/AuditPage.tsx`。
- `server/routes/conversations.ts`、`server/routes/governance.ts`、`server/routes/knowledge.ts`。
- `server/services/search.ts`、`server/types.ts`。
- `src/hooks/useResource.ts`、`src/lib/api.ts`。
- `src/App.tsx`：离开确认兼容分块草稿，保留设置页提示。
- `src/features/knowledge/types.ts`、`src/features/knowledge/useKnowledge.ts`、`src/features/knowledge/useKnowledgeBases.ts`。
- `src/features/knowledge/components/DocumentList.tsx`、`src/pages/UploadModal.tsx`。
- `src/features/permissions/types.ts`、`src/features/permissions/usePermissions.ts`。
- `src/features/settings/types.ts`、`src/features/settings/useSettings.ts`、`src/features/tasks/useTasks.ts`。
- `src/pages/DocumentsPage.tsx`、`src/pages/SettingsPage.tsx`、`src/pages/TasksPage.tsx`、`src/pages/OverviewPage.tsx`、`src/styles.css`。
- `tests/components/workspace.test.tsx`、`tests/e2e/workspace.spec.ts`、`tests/unit/api.test.ts`、`tests/api/store.test.ts`。
- `README.md`：同步 worker、实际能力和接口说明。

新增：

- `shared/contracts.ts`。
- `shared/text-limits.ts`。
- `server/http/errors.ts`、`server/http/validation.ts`。
- `server/repositories/state.ts`。
- `server/services/consistency.ts`、`server/services/mutations.ts`。
- `server/services/audit.ts`、`server/services/capabilities.ts`、`tests/api/audit.test.ts`。
- `server/services/document-edits.ts`、`tests/api/document-edits.test.ts`。
- `server/services/files.ts`、`server/routes/files.ts`。
- `server/jobs/queue.ts`、`server/jobs/worker.ts`、`server/jobs/views.ts`。
- `src/features/tasks/TaskDetails.tsx`、`src/lib/operation-key.ts`。
- `src/hooks/useUnsavedChanges.ts`。
- `src/lib/upload.ts`、`tests/api/files.test.ts`。
- `tests/api/jobs.test.ts`、`tests/api/validation.test.ts`。
- `server/services/data-check.ts`、`scripts/check-data.ts`、`tests/api/data-check.test.ts`。
- `docs/v2/data-preflight.md`、`artifacts/p2-seed-preflight.json`（仅 seed 副本示例）。
- `docs/v2/phase-2-progress.md`。

SQL 基础当轮新增 001-core、session/state-mapping/dry-run、postgres Repository、CLI/独立 runner 与基础测试，见 [基础历史记录](postgres-foundation.md)。本次新增 002-auth、`server/auth/`、`shared/auth.ts`、`scripts/init-local-auth.ts`、AuthProvider/AccessPage/改密/身份审计 UI、认证 E2E 与 20 项 SQL 测试等；业务入口已提供显式 SQL 模式。完整新增/修改清单见 [身份交付的文件表](local-auth-access.md#文件清单)，不据 Git HEAD 混淆 P1 与 P2。

## 验证结果与通过条件

| 检查 | 结果与覆盖 |
| --- | --- |
| `npm run check:tests` | 通过，包含测试配置的类型检查 |
| `npm test` | **65 项通过，11 个文件**；原 64 项 + grant 成功回执/错误回执契约回归 |
| `npm run test:postgres` | **21 项真实 SQL 测试，2 个文件**；8 项基础 + 本地身份/授权/原件/发布/改密/CLI/并发撤权与最后管理员等，补请求体检查顺序与拒绝上传不落盘；独立容器清理 |
| `npm run test:e2e` | **上一轮 13 项通过**；原 JSON/显式演示/十页与可靠性回归；本次安全收尾未重跑此组 |
| `npm run test:auth:e2e` | **5 项通过**；实际 SQL 入口、登录/恢复/退出/失效、创建账户与授权、改密/新密码登录、浅深/390px；有独立截图 |
| `npm run build` | 通过，包含前后端 TypeScript；Mermaid 相关分包仍超 500KB，另有 Zod 依赖注释位置导致 Rollup 移除注释的警告；均未作为已解决项 |
| `git diff --check` | 通过 |

测试使用临时数据目录和独立端口，API 上传测试也注入隔离原件目录，不读写用户原有 `data/db.json` 或原件。新增文件测试验证同名同字节重复上传仅产生一条原件记录；文件已导入后即使原件后来缺失，同一幂等请求仍重放已提交文档，避免将已完成写入报告为失败。

完整身份验证依次覆盖 check:tests、test:postgres、test、test:e2e、test:auth:e2e、build，当时为 20 + 65 项测试和 13 + 5 项 E2E。随后上传安全收尾先复现 2 项失败，再将 Origin/session/CSRF/upload 能力检查提前到读请求体之前，并在上传解析/落盘前通过 repository.load 复验；修复后 SQL 21 项、常规 65 项、类型检查与构建通过。认证 E2E 补跑结果见身份交付。具体文件、失败证据与跨 SQL/文件系统原子性限制见 [安全收尾记录](local-auth-access.md#上传与请求体检查顺序修复)。主题截图核对发现测试初始化覆盖问题后，补实际 data-theme 断言并重跑 5 项认证 E2E；具体失败修复记录见身份交付。

曾失败并已修复：服务端 Response JSON 的 unknown 类型收窄；Hono HTTP/HTTP2 联合类型无法直接调用 closeAllConnections，改为能力检查；设置组件测试 GET 固定返回旧 revision，改为模拟已提交状态；编辑该测试时的临时语法错误；分块 E2E 将成功提示误定位为 alert，按实际成功提示的 status 角色修正。未跳过失败用例。

本次预检类型检查曾发现 unknown 分块属性在回调中失去收窄，以及 findLastIndex 超出当前 ES2022 lib；分别改为局部已收窄变量和 findIndex，没有提高项目目标或关闭类型检查。

未执行：生产部署/用户数据 SQL apply/切换后回滚、多实例服务运行与性能基线、完整攻击样本/杀毒、真实 RAG/Agent 评测和完整安全审计。已通过的本地身份与库 ACL 用例只证明其具体范围，不代替这些验收。

## 未完成事项、依赖与下一步

1. PostgreSQL 与 001/002、本地身份、角色/成员库授权及事务重查已实现；默认 JSON 兼容，SQL 需显式配置和初始化，没有替用户迁移数据。
2. P2 后续完成存量身份/会话 owner/grant 映射与认领、正式迁移/备份恢复/切换后回滚，以及原件留存政策。旧未知身份不自动绑定管理员。
3. Auth 管理写入的通用幂等重放、专用数据库角色和更完整安全/多实例验证尚待推进；SSO/MFA/找回密码/强制首次改密未实现。
4. 文档/RAG/P3 与 Agent/P4 仍待阶段确认；当前文本准备不当成向量索引完成。
5. P2 完整验收后再按阶段确认推进 P3/P4；不自动更换主要技术栈或部署。

用户“按推荐方案继续”已解除 P0 的这两项选型等待；无需再次确认同一方案。后续模型/MCP/生产切换等独立决策仍按原流程。完整 P2 尚未完成，不提前推进 P3/P4。

## 回滚与兼容性

本轮未执行数据库迁移，新增 JSON 字段采用可选字段和读取兼容。但写入已包含任务、revision、稳定关系及幂等记录，回退旧代码会丢失这些行为，不能视为完全无影响。

- 回滚前停止唯一写入进程，另存完整工作区差异及 `data/db.json`。不使用 seed、旧浏览器缓存覆盖当前数据。
- 原件能力加入后，备份/迁移还必须包含整个 `data/files/`；只保存 JSON 不能恢复原文件。旧版 file 导入只传文件名的请求将返回 400，调用方需先上传获取 artifactId。回退代码后原件仍保留但旧界面不能下载，不能因此清理文件。
- 原件读取修复没有转换数据格式；若单独撤回该修复，仅撤回 files.ts 与对应测试/文档差异，但会重新允许追随链接及无界路径读取，不应将其作为正常解决存储配置错误的办法。改用实际原件目录不需要删除或重建原件。
- 只撤回本轮明确列出的改动，保留 P1 和用户已有修改；依赖文件成对回退。禁止 reset --hard、清理整个目录或删除用户备份。
- 恢复旧 API 前同步回退调用方的 revision/幂等契约，避免新旧前后端混用。
- 若回退到没有 worker 的版本，未完成任务将停止执行；保留原始数据，待恢复兼容版本后领取。重放保护也随旧实现失效。
- 新增的 `validate_chunks` 任务需要兼容该 kind 的 worker；回退旧 worker 会按普通文本任务处理并失败。先备份包含输入分块的 JSON，不用拼接重切方式转换；待恢复兼容 worker 后重试。批量 chunks API 与客户端需成对回退，原单分块路径仍保留。
- 本轮审计/能力标记均为可选新增字段；回退会丢失这些保护/展示语义，新 UUID 仍是字符串，旧路由可以读取，不要重编号已有 ID。不要为回退代码清理新增日志或覆盖历史；旧客户端依赖“权限通过”的行为不属于可保留的正确性契约。
- 没有自动降级、自动删字段或生产回滚操作。SQL 迁移的 down 方案需在选型与实际 Schema 确定后单独验证。
