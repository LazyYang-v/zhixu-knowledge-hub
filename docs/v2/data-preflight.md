# P2 数据只读预检

状态：已实现 JSON/关联/原件预检；SQL 事务 dry-run 与本地身份已另行落地，见 [身份与授权交付](local-auth-access.md)。数据库/身份已确认 PostgreSQL + 本地登录预留 SSO；未对用户数据执行正式导入、自动修复、原件清理或生产切换。预检报告仍不表示迁移就绪。

## 使用

先停止来源写入并取得完整副本（JSON 与 files 同一批次），在副本上运行：

```bash
npm run --silent data:check -- --input /path/to/snapshot-copy/db.json --files-dir /path/to/snapshot-copy/files
```

仅查看参数：

```bash
npm run --silent data:check -- --help
```

命令必须显式提供 `--input`，不读取 DATA_DIR 默认值、浏览器缓存或生产连接；不调用会初始化 seed 的 Store。只有 JSON 中没有原件元数据时，才可省略 `--files-dir` 而不产生“原件未核验”状态。旧文件型文档没有原件 ID 时仍会提示 `LEGACY_ORIGINAL_FILE_UNAVAILABLE`，不能把 `not_applicable` 理解成原始文件已找回。

输入 JSON 默认上限 64 MiB，可用 `--max-bytes` 设置 1..268435456 字节。更大的副本不强行载入，需后续分批/流式迁移工具。报告写到 stdout，程序自身不写报告文件；需要保存时由调用者明确重定向到独立路径，**不要重定向覆盖输入 JSON**：

```bash
npm run --silent data:check -- --input /path/to/snapshot-copy/db.json --files-dir /path/to/snapshot-copy/files > /path/to/reports/preflight.json
```

使用 `--silent` 避免 npm 的命令提示混入 JSON。退出码不会因重定向而变成成功；应同时检查退出码、status、totals 和 issueCounts。

## 检查范围

| 范围 | 已检查 | 不作出的推断 |
| --- | --- | --- |
| JSON/集合 | UTF-8、JSON 解析、根对象、七组必需集合、基础字段类型、未知根字段提示、配置与 revision | 不自动合并 seed、补字段或舍弃未知数据；不是所有未来业务 Schema 的完整验证 |
| ID/命名 | 集合内 ID、跨会话消息 ID、版本/分块 ID、规范化库名、邮箱大小写去重 | 不重新编号，不选择冲突中的“正确记录” |
| 文档关系 | baseId/legacy category 对应、版本标签/唯一性、当前分块与最新版本一致、原件引用 | 不假设仅凭名字就能恢复真实来源/页码或数据库外键 |
| 任务 | 文档/版本引用、活跃重复、输入、checkpoint、事件序号、有限尝试、lease、重试后继引用/跨文档/环 | 不执行任务、不取消旧任务、不伪造 checkpoint；过期 lease 仅提示可恢复 |
| 审计/评测/幂等 | 基础字段、审计时间/资源数组与已不可用的历史消息、有限指标/样本类型、幂等指纹/到期/结果字段 | 不把旧“通过”升级为可信鉴权，不把有限数字当作真实质量或性能 |
| 原件 | 元数据 Schema、记录键一致、摘要/长度、同摘要大小一致；检查有效元数据对应的字节 | 不做杀毒、完整文档解析、解压、OCR、页定位或内容真实性认证 |
| 目录/留存 | 陌生条目、目录、孤立 blob/原件记录仅报告；不递归 | 不删除、移动、修复、补造原件或修改留存期 |

只输出固定问题码、数组位置、关联位置、计数和输入摘要。不会输出文档/问题正文、邮箱、owner、原文件名、未知字段名或原始解析错误中的片段。诊断明细最多 200 条，严重错误优先保留；`totals`/`issueCounts` 仍统计全部问题，`issuesTruncated=true` 表示明细被截断。

原件路径只由通过 Schema 的 SHA256 构成，不使用上传名称作为磁盘路径。输入文件、原件文件以及原件根目录本身若是符号链接会被拒绝；文件打开使用 O_RDONLY/O_NOFOLLOW，未支持该能力的平台返回未完成。发现陌生目录/条目不读取其内容。父目录的系统路径别名不等同恶意叶子符号链接；本工具不提供对恶意并发替换目录的安全沙箱承诺。

读取前后检查文件身份、大小和时间，检查期间来源/目录变化会报告未完成。**这不是运行中一致性快照服务**，仍必须使用停写后的完整副本；对并发或恶意变更不能用一个绿色结果代替操作系统快照、数据库事务或备份恢复验收。

## 报告与退出码

报告 Schema 在 `server/services/data-check.ts:DataCheckReport`，包括：

- `scope: json-integrity-preflight`、`schemaVersion: 1`。
- `status: passed / warnings / failed / incomplete`。
- `counts`、`totals`、`issueCounts`、最多 200 条 `issues`。
- `fileVerification: passed / failed / incomplete / not_requested / not_applicable`。
- `sourceSha256`（成功读取/解析后的输入摘要）、`migrationReady: not_assessed`。
- `pendingMigrationChecks`：数据库选择、可信身份映射、资源授权映射、SQL 事务 dry-run。

| 退出码 | 含义 | 调用者应做什么 |
| --- | --- | --- |
| 0 | 指定完整性检查完成且无 error；**可能仍有 warning** | 阅读兼容/身份/原件缺失等警告，不据此直接切库 |
| 1 | 结构、关系、原件或其他完整性错误 | 阻止迁移；在独立副本确认原因，本工具不修复 |
| 2 | 参数错误、输入不可读/超预算、原件校验或快照检查未完成 | 提供正确副本/目录/预算后重跑，不能视为通过 |

`warnings` 包括缺稳定 legacy ID、缺原件、旧任务无执行记录、身份待映射、旧矩阵待映射到真实资源等。即使 exit=0，`migrationReady` 也始终是 `not_assessed`，**没有目标库、外键事务、账户认领和后端授权验证就不算迁移验收**。

部分问题码：

| 问题码 | 含义 |
| --- | --- |
| `DUPLICATE_ID` / `DUPLICATE_VERSION_ID` / `DUPLICATE_CHUNK_ID` / `DUPLICATE_MESSAGE_ID` | 对应命名空间存在重复 |
| `MISSING_BASE_REFERENCE` / `AMBIGUOUS_BASE_RELATION` | 稳定库 ID 不存在或旧名称关系歧义 |
| `CURRENT_VERSION_CONTENT_MISMATCH` | 文档当前分块与最新版本快照不一致 |
| `DUPLICATE_ACTIVE_JOB` / `JOB_VERSION_MISSING` / `INVALID_CHECKPOINT` | 持久任务关联或可恢复状态异常 |
| `TASK_SUCCESSOR_CYCLE` / `TASK_SUCCESSOR_DOCUMENT_MISMATCH` | 重试后继关系成环或跨文档 |
| `EXPIRED_RECOVERABLE_LEASE` | lease 过期；没有在预检中领取/执行 |
| `FILE_BYTES_NOT_CHECKED` | 有原件元数据但没有提供可核验目录 |
| `BLOB_INTEGRITY_ERROR` / `BLOB_MISSING_UNSAFE_OR_CHANGED` | 原件摘要不符，或缺失/不安全/读取时变化 |
| `INPUT_CHANGED_DURING_CHECK` / `FILES_DIRECTORY_CHANGED` | 检查期间副本或目录变动，不能当一致快照 |
| `LEGACY_ORIGINAL_FILE_UNAVAILABLE` | 文件型历史文档没有可核验原件关联 |
| `UNREFERENCED_BLOB` / `UNRECOGNIZED_FILE_ENTRY` | 孤立原件或非标准条目；只报告，不清理 |

## 实际实现与验证

新增：

- `server/services/data-check.ts`：纯检查与受限只读文件校验。
- `scripts/check-data.ts`：CLI、参数校验、JSON 报告与退出码。
- `tests/api/data-check.test.ts`：临时目录、只读/脱敏、损坏/缺失、符号链接、重复/关联/任务环、诊断上限、CLI 实际子进程。
- `artifacts/p2-seed-preflight.json`：**仓库 seed 副本的示例报告**，不是用户数据检查结果。

修改 `package.json` 增加 data:check 命令，`server/tsconfig.json` 将 scripts 的 TypeScript 纳入检查；没有新增依赖，也没有把工具挂到业务启动或 API。

示例确实用当前 CLI 读取临时 seed 副本产生，随后删除了临时副本：exit 0、0 个 error、40 个 warning。警告包括旧名称关联、缺原件、旧版本/分块 ID、无 job 的旧任务和身份待映射。它只演示命令和兼容诊断，不能作为生产数据健康或迁移就绪证据。[查看示例](../../artifacts/p2-seed-preflight.json)。

预检工具交付当轮只针对临时夹具与仓库 seed 副本运行；未读取用户运行时 `data/db.json` 或其备份。当轮未改变产品页面与业务 API，E2E 沿用前轮结果。之后的原件读取与已有 JSON 的 seed 隔离修复均重跑完整 E2E；最新验证、修改清单及兼容性以 [P2 记录](phase-2-progress.md) 为准。

曾出现的类型检查失败：unknown 分块属性在回调中失去收窄，改为局部已收窄变量；findLastIndex 不属于当前 ES2022 lib，改用 findIndex，不提高项目目标。没有跳过失败检查。

## 回滚

工具未写入来源，没有待回滚的数据。代码回滚仅撤回上述新增文件、npm 命令及 tsconfig include 的对应差异，保留 P1/P2 与用户修改。不要 reset/clean 整个目录，不要为了去掉示例报告删除其他 artifacts。SQL Adapter、迁移 apply、清理与生产切换仍是后续独立工作。
