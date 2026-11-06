import {
  ArrowRight,
  Database,
  FileText,
  MessageSquareText,
  Workflow,
} from "lucide-react";
import type { KnowledgeDocument, ProcessingTask } from "../../server/types";
import { RequestStatus } from "../components/RequestStatus";
import { Badge, PageHeader, StatCard } from "../components/ui";
import { Button, DataTable } from "../components/ui/index";
import { useResource } from "../hooks/useResource";
import { getDataMode } from "../lib/data-mode";
import { useWorkspace } from "../providers/WorkspaceProvider";
import DemoOverview from "./OverviewDemo";
import "./overview.css";
export default function OverviewPage({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  const { overview, health } = useWorkspace();
  const tasks = useResource<{ tasks: ProcessingTask[] }>(
    "/api/knowledge/tasks",
    { tasks: [] },
  );
  const documents = useResource<{ documents: KnowledgeDocument[] }>(
    "/api/knowledge/documents",
    { documents: [] },
  );
  if (getDataMode() === "demo") return <DemoOverview onNavigate={onNavigate} />;
  const stats = overview.data?.stats;
  const recent = [...(documents.data?.documents ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return (
    <div className="page-content ov-page">
      <PageHeader
        title="工作台总览"
        description="查看已保存的知识资产与任务记录，优先处理需要关注的内容。"
        action={
          <Button onClick={() => onNavigate("documents")}>
            添加文档 <ArrowRight size={16} />
          </Button>
        }
      />
      <RequestStatus {...overview} />
      <div className="stats-grid">
        <StatCard
          label="知识库"
          value={stats?.bases ?? "—"}
          icon={<Database size={20} />}
        />
        <StatCard
          label="文档记录"
          value={stats?.documents ?? "—"}
          detail={`${stats?.published ?? 0} 份已发布`}
          icon={<FileText size={20} />}
        />
        <StatCard
          label="待处理任务"
          value={stats?.tasks.running ?? "—"}
          detail="包含文本任务与历史记录"
          icon={<Workflow size={20} />}
        />
        <StatCard
          label="会话"
          value={stats?.conversations ?? "—"}
          icon={<MessageSquareText size={20} />}
        />
      </div>
      <div className="workspace-columns">
        <section className="panel">
          <div className="section-toolbar">
            <h3>需要关注</h3>
            <Button variant="ghost" onClick={() => onNavigate("tasks")}>
              全部任务 <ArrowRight size={14} />
            </Button>
          </div>
          <RequestStatus {...tasks} />
          <DataTable
            ariaLabel="待处理任务"
            loading={tasks.loading}
            rows={(tasks.data?.tasks ?? []).filter(
              (task) => task.status !== "done",
            )}
            rowKey={(task) => task.id}
            emptyTitle="暂无待处理任务"
            columns={[
              { key: "name", header: "文档", render: (task) => task.docName },
              {
                key: "status",
                header: "记录状态",
                render: (task) => (
                  <Badge tone={task.status === "error" ? "danger" : "warning"}>
                    {task.status === "error"
                      ? "失败"
                      : task.job
                        ? "排队或处理中"
                        : "历史记录"}
                  </Badge>
                ),
              },
            ]}
          />
        </section>
        <section className="panel">
          <h3 className="section-heading">快捷操作</h3>
          {[
            ["knowledge", "管理知识库"],
            ["documents", "添加与管理文档"],
            ["chat", "体验规则问答"],
            ["retrieval", "调试检索规则"],
          ].map(([page, label]) => (
            <button
              className="quick-action"
              key={page}
              onClick={() => onNavigate(page)}
            >
              {label}
              <ArrowRight size={16} />
            </button>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="section-toolbar">
          <h3>最近更新的文档</h3>
          <Button variant="ghost" onClick={() => onNavigate("documents")}>
            文档中心
          </Button>
        </div>
        <RequestStatus {...documents} />
        <DataTable
          ariaLabel="最近更新文档"
          loading={documents.loading}
          rows={recent}
          rowKey={(doc) => doc.id}
          columns={[
            { key: "name", header: "名称", render: (doc) => doc.name },
            { key: "base", header: "知识库", render: (doc) => doc.category },
            { key: "status", header: "状态", render: (doc) => doc.status },
            { key: "date", header: "更新日期", render: (doc) => doc.date },
          ]}
        />
      </section>
      <div className="workspace-columns">
        <section className="panel capability-card">
          <h3>服务连接</h3>
          <Badge tone={health.error ? "danger" : "neutral"}>
            {health.loading
              ? "检查中"
              : health.error
                ? "无法连接"
                : health.data?.status === "ok"
                  ? "API 可连接"
                  : "未知"}
          </Badge>
          <p>连接状态仅代表健康接口响应，不代表模型、索引与权限已就绪。</p>
          <Button variant="secondary" onClick={health.reload}>
            重新检查
          </Button>
        </section>
        <section className="panel capability-card">
          <h3>待接入能力</h3>
          <p>真实文件解析、向量检索、LLM、用户认证与 Agent 执行。</p>
          <p>趋势和检索延迟尚无可信测量数据，当前不显示推测指标。</p>
        </section>
      </div>
    </div>
  );
}
