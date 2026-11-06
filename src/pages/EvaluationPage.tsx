import { RequestStatus } from "../components/RequestStatus";
import { PageHeader, StatCard } from "../components/ui";
import { Button, DataTable, Drawer } from "../components/ui/index";
import { useEvaluation } from "../features/evaluation/useEvaluation";
import type { KnowledgeVersion } from "../features/knowledge/types";
import { useAction } from "../hooks/useAction";
import "./governance.css";
type KnowledgeVersionAlias = KnowledgeVersion;

export function EvaluationPage() {
  const {
    dataset,
    setDataset,
    running,
    start,
    latest,
    hit,
    accuracy,
    samples,
    selected,
    setSelected,
    data,
    loading,
    error,
    reload,
  } = useEvaluation();
  const { run, pending } = useAction();
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="质量评测"
        description="保留当前算法演示结果，真实答案、引用与权限评测待接入。"
        action={
          <Button loading={pending || running} onClick={() => void run(start)}>
            运行规则评测
          </Button>
        }
      />
      <RequestStatus loading={loading} error={error} reload={reload} />
      <div className="capability-note">
        下列指标是现有规则算法的判定值，不代表答案正确率。服务端阶段耗时为模拟值，不展示为性能数据。
      </div>
      <div className="stats-grid">
        <StatCard label="规则命中判定" value={latest ? `${hit}%` : "—"} />
        <StatCard label="高分规则占比" value={latest ? `${accuracy}%` : "—"} />
        <StatCard label="样本数" value={latest?.records.length ?? 0} />
        <StatCard label="真实延迟" value="未测量" />
      </div>
      <section className="panel">
        <div className="collection-controls">
          <label>
            评测集
            <select
              className="select"
              aria-label="评测集"
              value={dataset}
              onChange={(event) => setDataset(event.target.value)}
            >
              <option>{dataset}</option>
            </select>
          </label>
          <span className="muted">
            当前后端固定执行内置 8 题，尚未实现数据集切换
          </span>
        </div>
        <DataTable
          ariaLabel="评测样本"
          rows={samples}
          rowKey={(row, index) => String(index)}
          columns={[
            { key: "question", header: "问题", render: (row) => row[0] },
            {
              key: "source",
              header: "预期来源（未用于当前判分）",
              render: (row) => row[1],
            },
            { key: "score", header: "规则分数", render: (row) => row[2] },
            { key: "status", header: "规则判定", render: (row) => row[3] },
            {
              key: "detail",
              header: "详情",
              render: (row) => (
                <Button variant="ghost" onClick={() => setSelected(row)}>
                  查看
                </Button>
              ),
            },
          ]}
        />
      </section>
      <section className="panel">
        <h3 className="section-heading">运行历史</h3>
        <DataTable
          ariaLabel="评测历史"
          rows={data?.evaluations ?? []}
          rowKey={(item) => item.id}
          columns={[
            { key: "name", header: "名称", render: (item) => item.name },
            {
              key: "dataset",
              header: "数据集标签",
              render: (item) => item.dataset,
            },
            {
              key: "time",
              header: "创建时间",
              render: (item) =>
                new Date(item.createdAt).toLocaleString("zh-CN"),
            },
            { key: "status", header: "状态", render: (item) => item.status },
          ]}
        />
      </section>
      <Drawer
        open={!!selected}
        title="评测样本详情"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <h3>{selected[0]}</h3>
            <p>预期来源：{selected[1]}</p>
            <p>现有规则分数：{selected[2]}</p>
            <p>此判定尚未校验答案和引用正确性。</p>
          </>
        )}
      </Drawer>
    </div>
  );
}
