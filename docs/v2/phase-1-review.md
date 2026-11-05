# Zhixu Knowledge Hub V2 — 第一阶段：源码审查报告

> 审查日期：2026-11-06 · 基于真实源码逐文件核对，非猜测。

## 1. 前端页面与组件依赖关系

```
main.tsx → App.tsx (ToastProvider → Workspace)
App.tsx ├─ 直接引入 ChatPage（未懒加载）
        ├─ lazy(): OverviewPage / KnowledgePage / DocumentsPage / TasksPage
        │          PermissionsPage / AuditPage / EvaluationPage / RetrievalPage / SettingsPage
        ├─ components/ui.tsx：ToastProvider、useToast、IconButton、Badge、Modal、
        │                    PageHeader、StatCard、EmptyState（全部页面共用）
        └─ components/Markdown.tsx：仅 ChatPage 使用（react-markdown + remark-gfm + mermaid）
lib/api.ts（apiFetch）被 Chat/Knowledge/Governance 全部页面使用
lib/chat-data.ts：AnswerKind / Citation / RetrievalTrace 等类型 + 预置答案引擎 + sourceFor
lib/storage.ts：useLocalStorage（全部页面的本地持久化）
样式：styles.css（1419 行全局）+ 每页自带 CSS（chat 2418 / knowledge 1108 / governance 1076 / overview 857 行）
```

页面间通信：`onNavigate(page)` 回调（App 传入）；知识库→文档中心通过
`sessionStorage["knowledge-hub:category"]` 传递筛选。

## 2. 当前路由与导航实现

- **Hash 路由**：`location.hash.slice(1)` ↔ `page` state，`navigate(id)` 写 `location.hash`，
  监听 `hashchange`（浏览器前进/后退可用）。10 个页面 id：
  `overview / chat / knowledge / documents / retrieval / tasks / evaluation / permissions / audit / settings`。
- 无路由库；非法 hash 回落到 `chat`。深链接如 `#documents` 可直接访问。
- 布局壳：`.app-shell`（height:100dvh, overflow:hidden）= Sidebar + main-shell（Topbar + main-content）。
- 全局搜索（⌘K）、通知、帮助、个人菜单均在 Topbar 内以 state 弹层实现（无 URL 状态）。

## 3. 页面状态和 API 请求逻辑

- **统一模式**：`useLocalStorage` 为主数据源 → 挂载时 `apiFetch` 拉取服务端数据成功后覆盖 →
  变更走「本地乐观更新 + fire-and-forget API 调用」→ API 失败时保留本地更新（离线演示兜底）。
- `apiFetch` 失败统一返回 `null`：调用方无法区分 404/400/网络错误；无 loading/error 状态机、
  无缓存、无去重、无重试。
- 页面内部 state 巨大（如 ChatPage 约 20 个 useState/useLocalStorage），UI 状态与服务端状态未分离。
- 例外：RetrievalPage / EvaluationPage 的结果仅存内存 state（刷新即失）。

## 4. 重复组件、重复样式和大型文件

| 问题 | 位置 |
| --- | --- |
| `Toggle` 开关组件 | ChatPage 与 GovernancePages 各实现一份（样式不同） |
| 文件图标 | ChatPage `FileIcon` / KnowledgePages `DocIcon` 两份 |
| 详情 Modal | 各页面自行拼装，无统一 Drawer/详情容器 |
| 表格 | `.data-table` 全局样式 + 各页自定义列，无统一 Table 组件（无排序/分页/空态/加载态） |
| 演示数据内嵌 | `searchDocs`、`evalRows`、`popular`、`activity`、`seedMembers`、静态 `auditLogs` 散落在页面文件里 |
| 大文件 | GovernancePages 2010 行、KnowledgePages 1680 行、ChatPage 1404 行、chat.css 2418 行、styles.css 1419 行 |
| 设计变量 | `:root` 仅 9 个变量（颜色 5 个 + 侧栏宽），无间距/圆角/高度/动效/字号体系 |

## 5. 演示数据与真实服务端数据的边界

**真实 API 驱动**：会话与问答、引用与检索 Trace、知识库 CRUD、文档导入/发布/归档/分块/版本/回滚、
任务列表与重试、检索实验室、评测执行与指标、成员/权限矩阵、审计记录、系统设置、总览统计（/api/overview）。

**纯演示（前端内嵌，需明确标注）**：

- App：通知中心、个人资料、全局搜索结果、帮助页文案
- OverviewPage：趋势图、热门文档、活动时间线、统计卡（未接入 /api/overview）
- ChatPage：证据原文"纸张"渲染、版本时间线、相关度 98.6% 文案（检索 tab 已接真实 Trace）
- GovernancePages：「校验链路」tab、评测趋势 SVG 图、审计静态兜底数据（AUD-104x）
- KnowledgePages：`failed-demo` 假错误文档（后端无 error 文档时注入）、流水线阶段模拟推进

**混合（真实+演示兜底）**：任务列表（文档 task 状态）、评测样本列表（真实 records 优先）。

## 6. 已有功能及需要保持兼容的行为

- 深链接：`#chat` 等 10 个 hash 路由；浏览器前进/后退。
- `sessionStorage["knowledge-hub:category"]`：知识库卡片点击 → 文档中心按分类过滤。
- localStorage 键：`documents-v1`、`conversations-v1`、`active-conversation-v1`、`knowledge-bases-v1`、
  `members`、`permission-rules`、`evaluation-runs`、`settings`、`citations`、`multi-turn`、
  `answer-feedback`、`demo-task-failures`（键名不能变更，否则用户本地数据丢失）。
- 离线兜底：后端不可用时页面仍可用（本地种子数据 + 本地答案引擎）。
- 处理流水线自动推进（interval + advance API 双写）；失败任务重试链路。
- 审计 CSV 导出；回答复制；Mermaid 图渲染；⌘K 全局搜索；Esc 关闭弹层。

## 7. 前端可用的真实 API 清单（已核对 server/routes/*.ts）

| 域 | 方法与路径 | 说明 |
| --- | --- | --- |
| 健康 | GET `/api/health` | 服务状态 |
| 会话 | GET/POST `/api/conversations`；GET/DELETE `/api/conversations/:id` | 列表（含 query 搜索）、新建、详情、删除 |
| 问答 | POST `/api/conversations/:id/messages` | 提问，返回 userMessage/answerMessage（含 sources/retrieval/permission）+ conversation |
| 反馈 | PATCH `/api/conversations/:id/messages/:messageId/feedback` | rating: up/down |
| 知识库 | GET/POST `/api/knowledge/bases`；PUT/DELETE `/api/knowledge/bases/:id` | CRUD |
| 文档 | GET `/api/knowledge/documents`（query/status/category 过滤）；GET/PUT/DELETE `/documents/:id` | 列表/详情/编辑/删除 |
| 导入 | POST `/api/knowledge/documents/import` | mode: file(仅元数据)/web/text(服务端分块) |
| 流程 | POST `/documents/:id/publish|archive|advance|retry`；PUT `/documents/:id/chunks/:index`；POST `/documents/:id/rollback` | 状态流转、分块编辑（自动版本）、回滚 |
| 任务 | GET `/api/knowledge/tasks`；POST `/tasks/:id/retry` | 任务列表、重试 |
| 检索 | POST `/api/retrieval/search` | query/strategy/scope/threshold/topK → trace（stages+hits） |
| 评测 | GET/POST `/api/evaluations`；GET `/evaluations/:id` | 列表、执行（返回 metrics+records）、详情 |
| 权限 | GET `/api/permissions`；POST/PUT/DELETE `/permissions/members(/:id)`；PUT `/permissions/rules` | 成员与授权矩阵 |
| 审计 | GET `/api/audit`（query/action）；GET `/audit/:id` | 记录与证据链 |
| 设置 | GET/PUT `/api/settings` | 含 64–4096 分块等校验 |
| 总览 | GET `/api/overview` | stats + latestEvaluation |

**后端不支持（前端必须如实展示，不得伪造）**：流式回答（无 SSE/WebSocket）、文档批量操作/排序/分页参数、
任务执行日志、评测历史趋势与运行对比接口、审计时间范围过滤、部门树（后端为平铺列表）、
知识库成员授权入口（仅有全局矩阵）。

## 8. 重构风险与文件修改清单

**风险**：

1. chat.css（2418 行）与 ChatPage 三栏布局强耦合，重排证据面板时易破坏移动端。
2. localStorage 键名即兼容契约，任何键变更都会丢用户本地数据。
3. StrictMode 双执行：页面挂载 effect 已用 ref 防重入，新组件必须沿用该模式。
4. 离线兜底路径必须保留测试（后端关闭时页面不可白屏）。
5. Modal 焦点陷阱逻辑被多页依赖，替换为 Dialog 时需逐页回归。

**分阶段文件修改清单**（详见各阶段完成报告）：

| 阶段 | 新增 | 修改 |
| --- | --- | --- |
| 2 设计系统与布局 | `styles/tokens.css`、`components/ui/*`（Button/Input/Select/Field/Dialog/Drawer/Tabs/DataTable/Skeleton/ErrorState/Pagination/ConfirmDialog/index）、`layouts/Sidebar.tsx`、`layouts/Topbar.tsx` | `styles.css`（接入 tokens）、`App.tsx`（瘦身）、`main.tsx`、`index.html` |
| 3 知识助手 | `features/chat/*`、`lib/api/client.ts`、`lib/api/types.ts` | ChatPage → 迁移，`chat-data.ts` 类型整理 |
| 4 知识库与文档 | `features/knowledge/*`、`features/documents/*`、`lib/demo-data.ts` | KnowledgePages 拆分 |
| 5 任务与检索 | `features/tasks/*`、`features/retrieval/*` | KnowledgePages(Tasks)、GovernancePages(Retrieval) 拆分 |
| 6 评测/权限/审计/设置/总览 | `features/evaluation/*`、`features/permissions/*`、`features/audit/*`、`features/settings/*`、`features/overview/*` | GovernancePages、OverviewPage 拆分 |
| 7 响应式与无障碍 | — | 各 CSS、页面键盘可达性 |
| 8 测试验收 | `src/__tests__/*`（vitest 最小方案） | package.json scripts |

**兼容承诺**：hash 深链接、localStorage 键名、API 调用契约、离线兜底、现有全部交互在 V2 中保持不变。
