# 知序 · 企业知识库助手

源码基线、问题与路线见 [全项目审查](docs/v2/phase-0-system-audit.md)；接口详见 [当前与候选 API 目录](docs/v2/target-api-catalog.md)，数据库、迁移和单 Agent 方案见 [数据与 Agent 设计](docs/v2/target-data-agent-design.md)。方案文件中的 NEW 能力尚未实现，实际进展见本文 P1/P2 记录。

本地账户、会话、自助改密与成员库授权已在 PostgreSQL 模式接通，详见 [身份与授权交付](docs/v2/local-auth-access.md)。默认 JSON 仍为未认证的兼容开发模式；没有自动切换用户数据，P2 整体尚未完成。

参考企业知识库问答仪表盘实现的交互项目：前端为 React 19 + Vite 单页应用，后端为 Hono + Node.js 提供 REST API，围绕「知识怎么进入、怎么被找到、怎么被信任」组织功能，采用深色侧栏、紫色强调色及会话／回答／证据三栏布局，支持窄屏适配。

## 本地运行

建议使用 Node.js 24.15+（本轮使用 24.21.0 验证），或 22.22.2+。锁定的测试依赖不再支持 Node.js 20。

```bash
npm install
npm start
```

`npm start` 会同时启动后端（默认端口 8787）与前端开发服务器。也可以分开运行：

```bash
npm run server        # 仅后端，开发模式，文件变更自动重启
npm run dev           # 仅前端
npm run server:start  # 后端不带 watch 的启动方式
```

打开 **http://127.0.0.1:5173**。本机 `localhost` 的 IPv6 地址可能被其他应用占用，建议直接使用上述 IPv4 地址；若 5173 已被占用，以终端输出端口为准。Vite 已将 `/api` 代理到 `http://127.0.0.1:8787`。

```bash
npm run build     # TypeScript 检查并生成 dist/
npm run preview   # 预览构建产物，默认 http://127.0.0.1:4173
npm run check     # 前端与后端一起做 TypeScript 类型检查
```

结构化数据持久化在 `data/db.json`（首次启动自动写入种子数据），上传原件保存在 `data/files/`，目录已加入 `.gitignore`。可用 `DATA_DIR` 改变整个数据位置、`PORT` 改变端口。备份或迁移时必须同时保留 JSON 与原件目录。

seed 仅用于数据文件不存在时初始化。已有 JSON 缺少必需集合或 settings/rules 根类型错误会停止加载及写入，不再用演示数据补齐；合法空集合和可选字段缺省仍保留。不要删除故障文件来触发初始化，应先保存副本并确认恢复方案。此保护不等于完整业务数据校验。

## 后端 API 速览

前缀 `/api`，JSON 请求与响应。完整路由见 `server/routes/`。

| 域 | 端点 | 说明 |
| --- | --- | --- |
| 会话问答 | `GET/POST /api/conversations`、`GET/DELETE /api/conversations/:id` | 会话列表、新建、详情与删除 |
| 会话问答 | `POST /api/conversations/:id/messages` | 返回规则回答、演示来源、召回过程与未配置权限状态；显式 baseIds 返回 400 |
| 会话问答 | `PATCH /api/conversations/:id/messages/:messageId/feedback` | 回答点赞／点踩反馈 |
| 知识库 | `GET/POST /api/knowledge/bases`、`PUT/DELETE /api/knowledge/bases/:id` | 知识库增删改查 |
| 文档 | `GET /api/knowledge/documents`、`GET/PUT/DELETE /api/knowledge/documents/:id` | 文档筛选、详情、编辑与删除 |
| 文件 | `POST /api/knowledge/files`、`GET /api/knowledge/files/:id/download` | 上传原件、完整性校验与下载；单文件 20 MB，下载要求文件已关联文档 |
| 文档 | `POST /api/knowledge/documents/import` | 文件需先上传取得 artifactId；UTF-8 TXT/Markdown 或粘贴文本进入后台任务，网页只登记链接 |
| 文档 | `POST .../publish`、`POST .../archive` | 发布、归档；手动 `advance` 已禁用，不能模拟完成处理 |
| 分块与版本 | `PUT .../chunks`、`PUT .../chunks/:index`、`POST .../rollback` | 多分块原子保存；保留旧单块接口；每次修改生成一个版本，并保留分块边界 |
| 任务 | `GET /api/knowledge/tasks`、`POST /api/knowledge/tasks/:id/retry`、`POST .../:id/cancel`、`GET .../:id/events` | 处理记录、重试、取消与持久化事件 |
| 检索 | `POST /api/retrieval/search` | 关键词／语义／混合检索，返回分阶段过程与打分 |
| 评测 | `GET/POST /api/evaluations`、`GET /api/evaluations/:id` | 评测任务列表、详情与执行 |
| 权限 | `GET /api/permissions`、成员与规则增删改 | 部门、成员、角色与资源授权矩阵 |
| 审计 | `GET /api/audit`、`GET /api/audit/:id` | 审计记录筛选与证据链详情 |
| 设置 | `GET/PUT /api/settings` | 工作空间、检索与问答偏好（含参数校验） |
| 总览 | `GET /api/overview` | 工作台统计与最近评测 |

## 功能页面

| 主线 | 页面 | 可体验的交互 |
| --- | --- | --- |
| 工作入口 | 工作台总览 | 知识资产、任务概况、快捷入口 |
| 知识进入 | 知识库管理 | 分类查看、新建与编辑知识库 |
| 知识进入 | 文档中心 | 文档筛选、文件／网页／文本导入、发布归档、分块编辑、版本对比与回滚 |
| 知识进入 | 知识处理任务 | 保存文本的后台校验与固定长度切分、事件、取消和失败重试；历史流程记录单独标识 |
| 知识找到 | AI 知识助手 | 会话管理、示例问答、追问、引用原文、检索过程、权限详情、复制与反馈 |
| 知识找到 | 检索实验室 | 查询参数调整、结果排序与召回流程演示 |
| 知识信任 | 质量评测 | 示例评测任务及命中率、准确率、延迟等指标 |
| 知识信任 | 权限与组织 | 部门、成员、角色及访问范围配置演示 |
| 知识信任 | 审计中心 | 查询记录筛选、证据链与操作详情 |
| 工作配置 | 系统设置 | 工作空间、检索与模型相关配置演示 |

回答支持 Markdown 列表、表格、代码块与 Mermaid 流程图。全局搜索可通过 `⌘ K`／`Ctrl K` 打开。

## 当前能力边界

- 服务端提供 REST API；默认 JSON，另有显式 PostgreSQL + 本地身份/资源 ACL 模式。尚未接入 LLM、OCR、Embedding 或真实向量索引。
- 问答使用预置答案；检索使用字符二元组和同义词规则。检索中的 dense/rerank 字段为规则分数，不能当作模型相似度。
- 阶段耗时为模拟值；现有评测尚未使用预期来源校验命中，也不校验答案正确性。界面将这些值标为规则判定，不显示为真实质量或性能指标。
- 本地文件已实际传输并保存原件，可从文档预览下载。UTF-8 TXT/Markdown 与粘贴文本由持久化任务按 Unicode 码点固定长度切分；其他格式保存原件并报告解析器未接入。网页只保存 URL，网页抓取、OCR、其他格式解析及语义分块尚未实现。
- 上传检查大小、名称、文本编码及轻量文件签名；Office 格式仅检查容器签名，没有完整格式校验、杀毒或解压。SQL 认证模式校验暂存原件所有权及关联文档授权；JSON 兼容模式不执行资源 ACL。
- 原件读取拒绝叶子符号链接和直接作为原件根目录的符号链接，按同一文件句柄核验大小/摘要并限制读取量；路径不安全返回 409 FILE_STORAGE_UNSAFE。请将存储配置指向实际目录；这不提供对恶意并发替换目录的完整沙箱。
- 服务端模式不再自动回退演示数据。用户可在顶栏明确切换本地演示，旧 localStorage 数据仅在演示模式读取。
- 工作台统计与处理任务读取真实保存记录；API 进程内的 worker 执行保存文本任务，支持保存检查点、租约恢复、取消和重试。任务完成只代表文本准备完成，不代表向量索引建立。JSON 存储只能运行一个写入进程，不能另起 worker 或多实例共享文件。
- 旧权限矩阵仅保存配置；SQL 模式使用可信会话、角色能力与成员库 grant，旧成员/owner 不自动认领。普通读者只看发布快照，编辑/worker 完成不自动更新公开版本。
- API 保留规则回答、演示来源和模拟计时标记。JSON 权限为 not_configured；SQL 按实际后端校验标 enforced，真实引用定位仍未实现。审计区分匿名/系统/旧未核验/已认证主体，不把字段存在当作授权凭据。
- 浅色、深色和跟随系统主题已接入。Agent、真实流式生成、完整存量迁移/生产切换与 OIDC/MFA 尚未实现。

## 技术与文件

技术栈：前端为 React 19、TypeScript、Vite、Lucide React、react-markdown、remark-gfm、Mermaid，样式采用原生 CSS；后端为 Hono、@hono/node-server、tsx，数据以 JSON 文件持久化。

| 文件 | 用途 |
| --- | --- |
| `src/App.tsx` | 应用外壳、导航、全局搜索与帮助 |
| `src/styles.css` | 设计变量、通用组件与整体响应式布局 |
| `src/pages/ChatPage.tsx` | 会话、回答、引用与证据面板 |
| `src/lib/chat-data.ts` | 问答与引用演示素材 |
| `src/pages/OverviewPage.tsx` | 工作台总览 |
| `src/pages/KnowledgePages.tsx` | 知识库、文档与处理任务 |
| `src/pages/GovernancePages.tsx` | 检索、评测、权限、审计与设置 |
| `src/components/Markdown.tsx` | Markdown 与 Mermaid 渲染 |
| `src/components/ui.tsx` | 弹窗、提示、标签等共享组件 |
| `src/lib/storage.ts` | 浏览器本地持久化 |
| `server/index.ts` | 后端入口，默认端口 8787 |
| `server/app.ts` | Hono 应用、日志与路由挂载 |
| `server/routes/` | 会话、知识、治理三组接口实现 |
| `server/services/answer.ts` | 预置答案引擎与引用素材 |
| `server/services/search.ts` | 关键词／语义／混合检索打分 |
| `server/data/seed.ts` | 种子数据（与前端演示一致） |
| `server/services/files.ts`、`server/routes/files.ts` | 原件保存、上传检查与下载 |
| `server/lib/store.ts` | JSON 文件原子写入存储层 |
| `artifacts/desktop-final.png` | 桌面页面截图 |

原始设计参考保留在根目录的 `企业知识库智能问答仪表盘.png`。

## P1 体验与验证（2026-11-06）

- 顶栏支持浅色、深色、跟随系统；数据源由用户显式选择。
- 默认使用服务端。服务端错误会显示并可重试，不再自动切换到本地演示；旧浏览器业务数据只在本地演示模式读取，真实模式不覆盖这些数据。
- 工作台接入资产与任务记录；任务页不再通过前端计时器推进服务端任务。P1 完成时文件/网页只登记元数据；P2 当前上传能力见下文。Embedding、LLM、权限和 Agent 尚未接入。
- 审计保留原始时间和结果；规则评测结果与真实质量、延迟明确区分。
- 页面拆分、变更与测试记录见 `docs/v2/phase-1-implementation.md`。完整验收边界见该文档。

```bash
npm run check            # 前后端类型检查
npm test                 # 单元、组件、隔离 API/存储测试
npx playwright install chromium
npm run test:e2e         # 临时数据目录、独立端口，不使用 data/db.json
npm run build            # 包含前后端检查，再构建前端
```

E2E 默认使用 15173/18787；如端口被占用会停止，避免连接已有服务。`ZHIXU_API_TARGET` 仅控制 Vite 开发代理目标，默认仍为 127.0.0.1:8787。

## P2 可靠性进展（2026-11-06，阶段未完成）

已加入严格请求 Schema、统一错误与 requestId、乐观版本冲突检查、原子幂等写入、知识库重命名关联保护和持久化文本任务。编辑文档、知识库、成员、设置与权限规则时应发送读取到的 `revision`；成员删除通过 `If-Match` 发送版本。版本冲突返回 409，需要刷新比较后重试。写请求可携带 `Idempotency-Key`，相同键和输入重放已提交结果，保存 24 小时。

`CORS_ORIGINS` 可配置逗号分隔的允许来源，默认允许本机 Vite 开发来源及请求自身来源。CORS 和版本检查不替代登录与权限控制，当前 API 仍未认证。

文件上传已接通服务端原件保存、下载、传输进度、取消及批量失败重试；重复上传按文件名与内容摘要复用原件记录。TXT/Markdown 接入后台切分；其他格式不会显示为解析或索引成功。旧客户端的 file 导入需先上传获取 artifactId，单独提交文件名不再创建文档。

分块编辑一次保存全部修改，失败时保留草稿；出现版本冲突后可比较并重新载入最新分块。编辑与回滚的后台校验保留原分块边界及空白，避免重复切分重叠内容。当前 JSON 模式限制分块数量和总字符量，超限会记录失败；详情见 P2 记录。

业务写入与提交审计原子保存；幂等重放不重复记账。新审计只保存请求/资源 ID、路由模板和字段名，不保存请求值；写失败也记录，存储中断时输出明确审计告警。`audit` 设置仅控制可选检索摘要；业务写入审计不受其关闭影响。日志尚无真实身份或防篡改保证。

新增只读数据预检命令，显式检查停写后的 JSON 与原件副本，不初始化、修复或清理来源：

```bash
npm run --silent data:check -- --input /path/to/snapshot-copy/db.json --files-dir /path/to/snapshot-copy/files
```

退出码 0 可包含兼容警告，1 为完整性失败，2 为参数错误或核验未完成；`migrationReady` 始终为 `not_assessed`。范围、限制与仅 seed 副本示例见 [数据预检说明](docs/v2/data-preflight.md)，不能据此直接切换数据库。

已确认 PostgreSQL + 本地登录预留 OIDC/SSO。SQL 核心适配器、事务 dry-run、显式初始化、登录/退出/改密、账户管理和成员库授权已落地。没有对用户 JSON 执行导入/切换；真实模型与索引仍未完成。

```bash
npm run test:postgres                 # 自建并清理隔离 Docker PostgreSQL，无需已有数据库
npm run test:auth:e2e                 # 隔离 SQL + 实际认证入口 + 浏览器
npm run --silent data:dry-run -- --help
npm run --silent auth:init -- --help  # 仅查看参数，不连接数据库
```

最新 21 项真实 PostgreSQL 测试、65 项单元/组件/API 测试、5 项认证 E2E、类型检查和构建通过。13 项原有 E2E 为上一轮通过结果，本次安全收尾未重跑这组。上传安全收尾详情见 [身份交付记录](docs/v2/local-auth-access.md#上传与请求体检查顺序修复)。认证 E2E 覆盖真实账户创建、授权保存/刷新、会话恢复/失效、改密及新密码登录；截图已核验登录浅深主题与 390px 布局。

SQL 入口需显式配置 ZHIXU_STORAGE=postgres、ZHIXU_DATABASE_URL、ZHIXU_TENANT_ID，并先对明确的目标执行 auth:init；服务启动不自动建表/账户。默认 Secure Cookie，仅本地开发可显式允许不安全本地 Cookie。具体初始化/运行/兼容与回滚见 [身份与授权交付](docs/v2/local-auth-access.md)，历史基础记录见 [PostgreSQL 基础](docs/v2/postgres-foundation.md)，阶段边界见 [P2 进展](docs/v2/phase-2-progress.md)。构建仍有 Mermaid 大分包与 Zod 注释警告。
