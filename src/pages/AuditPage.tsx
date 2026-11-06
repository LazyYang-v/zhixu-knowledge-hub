import { RequestStatus } from "../components/RequestStatus";
import { Badge, PageHeader, StatCard } from "../components/ui";
import { Button, DataTable, Drawer } from "../components/ui/index";
import { useAudit } from "../features/audit/useAudit";
import type { KnowledgeVersion } from "../features/knowledge/types";
import { downloadCsv } from "../lib/csv";
import "./governance.css";
import { useAuthorization } from "../hooks/useAuthorization";
import { AuthEventsPanel } from "../features/audit/AuthEventsPanel";
type KnowledgeVersionAlias = KnowledgeVersion;

function formatLogTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? `${value}（演示时间）`
    : date.toLocaleString("zh-CN");
}
export function AuditPage() {
  const { secured, can } = useAuthorization();
  const {
    query,
    setQuery,
    filter,
    setFilter,
    status,
    setStatus,
    selected,
    setSelected,
    filtered,
    logs,
    loading,
    error,
    reload,
  } = useAudit();
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="审计中心"
        description={
          secured
            ? "查看实际业务、账户与授权事件。规则问答不代表真实模型执行证据。"
            : "查看已记录的操作。当前身份校验与完整执行证据链尚未接入。"
        }
        action={
          <Button
            variant="secondary"
            disabled={!filtered.length}
            onClick={() =>
              downloadCsv(
                `审计日志-${new Date().toISOString().slice(0, 10)}.csv`,
                [
                  ["ID", "时间", "用户", "部门", "操作", "内容", "结果"],
                  ...filtered.map((log) => [
                    log.id,
                    log.time,
                    log.user,
                    log.department,
                    log.action,
                    log.content,
                    log.status,
                  ]),
                ],
              )
            }
          >
            导出当前结果
          </Button>
        }
      />
      <RequestStatus loading={loading} error={error} reload={reload} />
      <div className="stats-grid">
        <StatCard label="已记录操作" value={logs.length} />
        <StatCard
          label="问答记录"
          value={
            logs.filter(
              (log) => log.action === "智能问答" || log.action === "知识问答",
            ).length
          }
        />
        <StatCard
          label="未命中"
          value={logs.filter((log) => log.status === "未命中").length}
        />
        <StatCard label="权限执行" value={secured ? "后端授权" : "未接入"} />
      </div>
      {secured && can("audit.read") && <AuthEventsPanel />}
      <section className="panel">
        <div className="collection-controls">
          <input
            className="input"
            aria-label="搜索审计日志"
            placeholder="操作人、内容、资源或请求 ID"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="select"
            aria-label="操作类型"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["全部操作", ...new Set(logs.map((log) => log.action))].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
          <select
            className="select"
            aria-label="审计结果"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["全部状态", ...new Set(logs.map((log) => log.status))].map(
              (item) => (
                <option key={item}>{item}</option>
              ),
            )}
          </select>
        </div>
        <DataTable
          ariaLabel="审计记录"
          loading={loading}
          rows={filtered}
          rowKey={(log) => log.id}
          columns={[
            {
              key: "time",
              header: "时间",
              sortable: true,
              sortValue: (log) => log.time,
              render: (log) => formatLogTime(log.time),
            },
            {
              key: "user",
              header: "操作人",
              render: (log) => (
                <div>
                  {log.user}
                  <small className="muted">
                    {log.actorKind === "system"
                      ? "系统处理器"
                      : log.actorKind === "anonymous"
                        ? "未认证主体"
                        : log.actorKind === "user"
                          ? "服务端主体"
                          : "历史身份未核验"}
                  </small>
                </div>
              ),
            },
            { key: "action", header: "操作", render: (log) => log.action },
            { key: "content", header: "内容", render: (log) => log.content },
            {
              key: "status",
              header: "结果",
              render: (log) => (
                <Badge
                  tone={
                    log.status === "正常" || log.status === "通过"
                      ? "success"
                      : log.status === "未命中"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {log.status}
                </Badge>
              ),
            },
            {
              key: "detail",
              header: "详情",
              render: (log) => (
                <Button variant="ghost" onClick={() => setSelected(log)}>
                  查看
                </Button>
              ),
            },
          ]}
        />
      </section>
      <Drawer
        open={!!selected}
        title="操作记录详情"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <code>{selected.id}</code>
            <dl className="gp-detail-grid">
              <div>
                <dt>时间</dt>
                <dd>{formatLogTime(selected.time)}</dd>
              </div>
              <div>
                <dt>操作人（记录值）</dt>
                <dd>
                  {selected.user} · {selected.department}
                </dd>
              </div>
              <div>
                <dt>操作</dt>
                <dd>{selected.action}</dd>
              </div>
              <div>
                <dt>结果</dt>
                <dd>{selected.status}</dd>
              </div>
              {selected.requestId && (
                <div>
                  <dt>请求 ID</dt>
                  <dd>
                    <code>{selected.requestId}</code>
                  </dd>
                </div>
              )}
              {selected.route && (
                <div>
                  <dt>操作接口</dt>
                  <dd>
                    {selected.method} {selected.route}
                  </dd>
                </div>
              )}
              {selected.targetId && (
                <div>
                  <dt>资源 ID</dt>
                  <dd>
                    {selected.targetType} · <code>{selected.targetId}</code>
                  </dd>
                </div>
              )}
              {selected.errorCode && (
                <div>
                  <dt>错误码</dt>
                  <dd>{selected.errorCode}</dd>
                </div>
              )}
              {selected.changedFields?.length ? (
                <div>
                  <dt>提交字段（不含值）</dt>
                  <dd>{selected.changedFields.join("、")}</dd>
                </div>
              ) : null}
            </dl>
            <p>{selected.content}</p>
            <h4>记录中的关联资源</h4>
            {selected.docs.length ? (
              selected.docs.map((name) => <p key={name}>{name}</p>)
            ) : (
              <p>
                此记录未保存文档标题；关联资源以实际保存的 ID
                为准，不能据此判断是否被权限拦截。
              </p>
            )}
            <div className="info-callout">
              这里只展示保存的事件字段。当前服务端未验证实际用户身份，也未保存可核验的完整权限证据链。
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
