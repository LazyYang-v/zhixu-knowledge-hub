import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { TaskDetails } from "../features/tasks/TaskDetails";
import { useState } from "react";
import { RequestStatus } from "../components/RequestStatus";
import { Badge, PageHeader, StatCard, useToast } from "../components/ui";
import { Button, DataTable, Drawer, Tabs } from "../components/ui/index";
import type { KnowledgeVersion } from "../features/knowledge/types";
import { useTasks } from "../features/tasks/useTasks";
import { useAction } from "../hooks/useAction";
import "./knowledge.css";
type PageProps = { onNavigate?: (page: string) => void };
type Version = KnowledgeVersion;
const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
const today = () => new Date().toLocaleDateString("sv-SE");

export function TasksPage({ onNavigate }: PageProps) {
  const { stages, tasks, retry, cancel, loading, error, reload } = useTasks();
  const { run, pending } = useAction();
  const toast = useToast();
  const [cancelTarget, setCancelTarget] = useState<
    (typeof tasks)[number] | null
  >(null);
  const [filter, setFilter] = useState("all");
  const rows = tasks.filter(
    (task) => filter === "all" || task.status === filter,
  );
  const [selected, setSelected] = useState<(typeof tasks)[number] | null>(null);
  return (
    <div className="page-content kp-page">
      <PageHeader
        title="知识处理任务"
        description="文本任务由后台处理器执行并持久化。文件解析和向量索引尚未接入。"
        action={
          <Button onClick={() => onNavigate?.("documents")}>添加文档</Button>
        }
      />
      <RequestStatus loading={loading} error={error} reload={reload} />
      <div className="stats-grid">
        {[
          ["任务总数", tasks.length],
          ["处理中", tasks.filter((t) => t.status === "running").length],
          ["失败", tasks.filter((t) => t.status === "error").length],
          ["已完成", tasks.filter((t) => t.status === "done").length],
        ].map(([label, value]) => (
          <StatCard key={label} label={String(label)} value={value} />
        ))}
      </div>
      <section className="panel">
        <div className="collection-controls">
          <Tabs
            ariaLabel="任务状态"
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: "all", label: "全部" },
              { id: "running", label: "处理中" },
              { id: "error", label: "失败" },
              { id: "done", label: "已完成" },
            ]}
          />
          <Button variant="secondary" onClick={reload}>
            刷新状态
          </Button>
        </div>
        <DataTable
          ariaLabel="处理任务列表"
          loading={loading}
          rows={rows}
          rowKey={(task) => task.id}
          columns={[
            {
              key: "name",
              header: "文档",
              render: (task) => (
                <button
                  className="text-button"
                  onClick={() => setSelected(task)}
                >
                  {task.docName}
                </button>
              ),
            },
            {
              key: "stage",
              header: "阶段",
              render: (task) =>
                task.job
                  ? ([
                      "排队",
                      "文本校验",
                      task.job.kind === "validate_chunks"
                        ? "分块校验"
                        : "固定分块",
                      "文本就绪",
                    ][task.stage] ?? task.job.state)
                  : "历史记录",
            },
            {
              key: "status",
              header: "状态",
              render: (task) => (
                <Badge
                  tone={
                    task.status === "error"
                      ? "danger"
                      : task.status === "done"
                        ? "success"
                        : "purple"
                  }
                >
                  {task.job?.state === "cancelled"
                    ? "已取消"
                    : task.status === "done"
                      ? "文本处理完成"
                      : task.status === "error"
                        ? "失败"
                        : "排队或处理中"}
                </Badge>
              ),
            },
            {
              key: "time",
              header: "更新时间",
              sortable: true,
              sortValue: (task) => task.updatedAt,
              render: (task) =>
                new Date(task.updatedAt).toLocaleString("zh-CN"),
            },
            {
              key: "action",
              header: "操作",
              render: (task) => (
                <div className="header-actions">
                  <Button
                    variant="ghost"
                    disabled={
                      task.status !== "error" ||
                      !!task.supersededBy ||
                      !!task.error?.match(/^(PARSER|FETCHER)_UNAVAILABLE/)
                    }
                    title={
                      task.error?.match(/^(PARSER|FETCHER)_UNAVAILABLE/)
                        ? "对应处理器尚未接入，暂不可重试"
                        : undefined
                    }
                    loading={pending}
                    onClick={() =>
                      void run(async () => {
                        await retry(task);
                        toast("重试任务已持久化", "success");
                      })
                    }
                  >
                    重试
                  </Button>
                  {task.job &&
                    ["queued", "running", "retry_wait"].includes(
                      task.job.state,
                    ) && (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setCancelTarget(task)}
                      >
                        取消
                      </Button>
                    )}
                </div>
              ),
            },
          ]}
        />
      </section>
      <ConfirmDialog
        open={!!cancelTarget}
        title="取消此任务？"
        description="已保存的文档不会删除；尚未提交的处理结果将被丢弃。"
        confirmLabel="取消任务"
        loading={pending}
        onCancel={() => {
          if (!pending) setCancelTarget(null);
        }}
        onConfirm={() =>
          void run(async () => {
            if (cancelTarget) {
              await cancel(cancelTarget);
              setCancelTarget(null);
              toast("任务已取消", "success");
            }
          })
        }
      />
      <Drawer
        open={!!selected}
        title="任务详情"
        onClose={() => setSelected(null)}
      >
        {selected && <TaskDetails task={selected} />}
      </Drawer>
    </div>
  );
}
