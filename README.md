# 知序 · 企业知识库助手

参考企业知识库问答仪表盘实现的交互项目：前端为 React 19 + Vite 单页应用，后端为 Hono + Node.js 提供 REST API，围绕「知识怎么进入、怎么被找到、怎么被信任」组织功能，采用深色侧栏、紫色强调色及会话／回答／证据三栏布局，支持窄屏适配。

## 本地运行

建议使用 Node.js 20.19+ 或 22.12+。

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

数据持久化在 `data/db.json`（首次启动自动写入种子数据），目录已加入 `.gitignore`，可用 `DATA_DIR` 环境变量改变位置、`PORT` 改变端口。

## 后端 API 速览

前缀 `/api`，JSON 请求与响应。完整路由见 `server/routes/`。

| 域 | 端点 | 说明 |
| --- | --- | --- |
| 会话问答 | `GET/POST /api/conversations`、`GET/DELETE /api/conversations/:id` | 会话列表、新建、详情与删除 |
| 会话问答 | `POST /api/conversations/:id/messages` | 提问并返回带引用、检索过程与权限详情的回答 |
| 会话问答 | `PATCH /api/conversations/:id/messages/:messageId/feedback` | 回答点赞／点踩反馈 |
| 知识库 | `GET/POST /api/knowledge/bases`、`PUT/DELETE /api/knowledge/bases/:id` | 知识库增删改查 |
| 文档 | `GET /api/knowledge/documents`、`GET/PUT/DELETE /api/knowledge/documents/:id` | 文档筛选、详情、编辑与删除 |
| 文档 | `POST /api/knowledge/documents/import` | 文件（元数据）／网页／文本导入 |
| 文档 | `POST .../publish`、`POST .../archive`、`POST .../advance` | 发布、归档与处理流水线推进 |
| 分块与版本 | `PUT .../chunks/:index`、`POST .../rollback` | 分块编辑（自动生成新版本）与版本回滚 |
| 任务 | `GET /api/knowledge/tasks`、`POST /api/knowledge/tasks/:id/retry` | 处理任务列表与失败重试 |
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
| 知识进入 | 知识处理任务 | 解析、切分、权限注入、向量化与索引流程演示，失败任务重试 |
| 知识找到 | AI 知识助手 | 会话管理、示例问答、追问、引用原文、检索过程、权限详情、复制与反馈 |
| 知识找到 | 检索实验室 | 查询参数调整、结果排序与召回流程演示 |
| 知识信任 | 质量评测 | 示例评测任务及命中率、准确率、延迟等指标 |
| 知识信任 | 权限与组织 | 部门、成员、角色及访问范围配置演示 |
| 知识信任 | 审计中心 | 查询记录筛选、证据链与操作详情 |
| 工作配置 | 系统设置 | 工作空间、检索与模型相关配置演示 |

回答支持 Markdown 列表、表格、代码块与 Mermaid 流程图。全局搜索可通过 `⌘ K`／`Ctrl K` 打开。

## 演示边界

- 后端提供完整 REST API 并持久化数据，但不调用大模型、OCR、Embedding 或向量数据库，没有真实身份认证；服务端权限隔离仅到「接口参数校验」这一层。
- 问答使用服务端预置答案引擎，检索基于字符二元组与同义词表的真实打分（BM25 思路 + 语义扩展 + 重排序），评测指标由真实检索结果计算，不代表生产检索质量。
- 本地文件仅记录名称、大小等元数据，不上传或解析文件内容；网页仅记录地址，不抓取页面；粘贴文本会在服务端生成分块。
- 前端核心页面已接入后端：AI 知识助手（会话、提问、反馈、证据面板）、知识库管理、文档中心（导入／发布／归档／分块编辑／版本回滚）、知识处理任务、检索实验室、质量评测（真实指标）、权限与组织、审计中心与系统设置。后端不可用时自动回退到浏览器本地演示数据，页面不中断。
- 证据面板中的检索过程与相关度、评测的命中率／准确率／延迟均来自服务端真实计算；每次问答与检索测试都会在审计中心留下服务端记录。
- 文档处理流水线通过 `advance` 接口逐步推进（解析 → 切分 → 权限注入 → 向量化 → 索引），用于演示任务状态流转。
- 工作台总览的趋势图表仍为演示数据；本地文件仅记录元数据，不解析内容；网页不抓取页面。

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
| `server/lib/store.ts` | JSON 文件原子写入存储层 |
| `artifacts/desktop-final.png` | 桌面页面截图 |

原始设计参考保留在根目录的 `企业知识库智能问答仪表盘.png`。
