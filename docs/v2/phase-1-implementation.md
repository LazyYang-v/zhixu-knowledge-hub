# P1 实施与验收记录

基线：`snapshot-2026-11-06` / `7c8e15d744223fd29114aed7625e0c1025bc59bc`。
状态：P1 已完成；与后续 P2 增量一并纳入本次代码交付，P2 进度见 `phase-2-progress.md`；未执行生产部署。

## 实际交付

- 十个 Hash 页面保留，知识与治理大文件改为兼容导出入口；页面分别按需加载，聊天证据面板和文档列表拆成组件。
- 统一语义色、浅色/深色/系统主题、排版与移动端表格滚动；复用 Button、Field、Tabs、DataTable、Drawer。抽屉/弹窗与移动导航共享焦点约束。
- 服务端与本地演示显式分离。服务端失败不再返回演示成功；旧浏览器业务记录只在演示模式读取/保存，真实记录不写入这些缓存。
- 请求保留 HTTP 状态、错误码和 requestId，支持超时、取消和必要响应字段检查；读取防止过期响应覆盖。
- 写操作成功后同步记录；错误时保留表单；批量导入在同一弹窗内重试时跳过已成功项。
- 知识库新增卡片/表格与排序，工作台接入真实统计、文档和任务记录；任务页读取服务端任务，停止在真实模式通过前端计时器完成任务。
- 聊天采用服务端返回的会话与消息，补齐“更早”分组、多轮开关契约、反馈持久化/取消。清空历史明确删除服务端记录，并支持部分失败重试。
- 审计使用完整日期和原始结果，CSV 防公式前缀；不再把未命中变成越权拦截或构造已验证权限链。
- 检索展示 HTTP 往返测量和提交配置；规则评分、预置引用与评测判定明确标识，不冒充模型质量或真实性能。
- seed 已审核为示例内容并纳入可跟踪文件；运行时 `/data/` 继续忽略。构建脚本同时检查前后端。

## 必要后端兼容修复

本阶段没有数据库迁移或新增模型服务。仅增加以下可靠性与现有界面的契约闭环：

1. messages 尊重 multiTurn 参数；feedback 接受 null 清除反馈，不改变原有 up/down 客户端。
2. 实际 E2E 复现首次并发读取共享临时文件冲突，因此补上 Store 单次加载、同进程串行写、独立临时文件和写成功后发布内存状态。
3. 数据文件损坏或读取失败不再被种子覆盖。存储并发、损坏保护与失败 mutation 均有隔离文件测试。

Store 的保护仅限同一进程；多实例并发、事务 Repository 和数据库迁移仍属于 P2。

## 验证结果

| 检查 | 结果 |
|---|---|
| `npm test` | 15 项通过，5 个文件：HTTP 拒绝/无效响应/超时/取消、CSV、失败创建、焦点、键盘、竞态、多轮/反馈、存储并发与损坏保护 |
| `npm run test:e2e` | 8 项通过，默认完整 Chromium；覆盖十页双主题和移动端、真实创建/文本登记与刷新、写失败、本地隔离、未保存离开、会话响应、部分删除、批量重试、反馈刷新/取消 |
| `npm run check:tests` | 通过，包含测试和配置的类型检查 |
| `npm run build` | 通过，包含前后端类型检查；Mermaid 相关大分包仍有提示 |
| 隔离源码检查 | 通过：将 Git 跟踪及本轮新源码复制到临时目录，共享已安装锁定依赖，前端/后端/测试三份配置均可编译；未执行全新依赖下载安装 |
| `git diff --check` | 通过 |
| 视觉检查 | 桌面浅色、知识库深色、390px 文档与聊天；修复白色残留和表格竖排；页面宽度 390px，无整页横向溢出 |

测试后端在系统临时目录保存数据，使用独立端口，不操作原有 data/db.json。

曾出现的失败及处置：Node 测试清理错误访问 localStorage，已修复；E2E 定位器同时匹配多个按钮，已修正；测试浏览器缺失，安装完整 Chromium 并配置 channel；首次加载 JSON 临时文件竞争，已修复并新增回归测试。最终无未解决的测试失败。

## 重要限制与未执行项目

- 后端仍为规则演示，没有真实身份认证/授权、解析、Embedding、向量索引、LLM、SSE 或 Agent。API 内的历史 permission/source 字段尚未成为可信证据；前端明确标注未核验。
- 评测仍采用现有错误口径，P1 只如实命名与展示。真实数据集、引用校验、无答案与权限评测留在 P3。
- 文件/网页只登记元数据；本阶段没有真实二进制上传、抓取和 OCR。批量进度表示记录登记进度。
- 后台 worker 尚未接入，重试只保存请求状态，不能宣称任务已执行。
- 知识库与文档仍使用 category 名称关联；稳定外键、重命名一致性、文档编辑 revision 与原子索引切换属于 P2/P3。
- 未执行生产部署、数据库迁移、真实模型/解析/RAG 评测、性能压测、完整安全审计或多实例恢复测试。
- 浏览器旧演示数据未删除；服务端模式不自动导入这些数据。图片是实际隔离环境截图，不作为质量指标。

## 回滚

本阶段未改数据库格式。保留 snapshot 标签及用户备份；如需回滚代码，只按下方清单回退本阶段修改并移除本阶段新增文件，先另存后续用户改动。不要 reset --hard 或清理整个目录。

如果新服务已接受业务写入，先备份 data/db.json，不用种子文件或旧浏览器缓存替换它；回滚代码不应回滚业务数据。依赖回退时同步 package.json 和 package-lock.json。

## 实际修改文件

- `.gitignore`
- `README.md`
- `index.html`
- `package-lock.json`
- `package.json`
- `server/lib/store.ts`
- `server/routes/conversations.ts`
- `src/App.tsx`
- `src/components/Markdown.tsx`
- `src/components/ui.tsx`
- `src/components/ui/DataTable.tsx`
- `src/components/ui/Drawer.tsx`
- `src/components/ui/Field.tsx`
- `src/components/ui/Tabs.tsx`
- `src/components/ui/legacy-core.tsx`
- `src/features/audit/useAudit.ts`
- `src/features/chat/composer.ts`
- `src/features/chat/useConversations.ts`
- `src/features/chat/useFeedback.ts`
- `src/features/evaluation/useEvaluation.ts`
- `src/features/knowledge/useDocumentState.ts`
- `src/features/knowledge/useKnowledge.ts`
- `src/features/knowledge/useKnowledgeBases.ts`
- `src/features/permissions/usePermissions.ts`
- `src/features/retrieval/useRetrieval.ts`
- `src/features/settings/useSettings.ts`
- `src/features/tasks/useTasks.ts`
- `src/layouts/Sidebar.tsx`
- `src/layouts/Topbar.tsx`
- `src/lib/api.ts`
- `src/lib/storage.ts`
- `src/pages/ChatPage.tsx`
- `src/pages/GovernancePages.tsx`
- `src/pages/KnowledgePages.tsx`
- `src/pages/OverviewPage.tsx`
- `src/pages/chat.css`
- `src/pages/governance.css`
- `src/pages/knowledge.css`
- `src/pages/overview.css`
- `src/styles.css`
- `src/styles/components.css`
- `src/styles/tokens.css`
- `vite.config.ts`

## 新增文件

- `artifacts/p1-chat-mobile.png`
- `artifacts/p1-documents-mobile.png`
- `artifacts/p1-knowledge-dark.png`
- `artifacts/p1-overview-light.png`
- `docs/v2/phase-1-implementation.md`
- `docs/v2/phase-1-plan.md`
- `playwright.config.ts`
- `scripts/test-server.mjs`
- `server/data/seed.ts`
- `src/components/CapabilityNote.tsx`
- `src/components/ConnectionStatus.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/RequestStatus.tsx`
- `src/features/chat/components/DemoEvidencePanel.tsx`
- `src/features/chat/components/EvidencePanel.tsx`
- `src/features/chat/components/FileIcon.tsx`
- `src/features/knowledge/components/DocumentList.tsx`
- `src/hooks/useAction.ts`
- `src/hooks/useCollection.ts`
- `src/hooks/useDialogFocus.ts`
- `src/hooks/useResource.ts`
- `src/lib/csv.ts`
- `src/lib/data-mode.ts`
- `src/pages/AuditPage.tsx`
- `src/pages/DocumentsPage.tsx`
- `src/pages/EvaluationPage.tsx`
- `src/pages/KnowledgePage.tsx`
- `src/pages/OverviewDemo.tsx`
- `src/pages/PermissionsPage.tsx`
- `src/pages/RetrievalPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/TasksPage.tsx`
- `src/pages/UploadModal.tsx`
- `src/providers/ThemeProvider.tsx`
- `src/providers/WorkspaceProvider.tsx`
- `tests/api/conversations.test.ts`
- `tests/api/store.test.ts`
- `tests/components/workspace.test.tsx`
- `tests/e2e/workspace.spec.ts`
- `tests/setup.ts`
- `tests/unit/api.test.ts`
- `tests/unit/csv.test.ts`
- `tsconfig.tests.json`
- `vitest.config.ts`
