import { useState } from "react";
import { useResource } from "../../hooks/useResource";
import { apiFetch } from "../../lib/api";
import { getDataMode } from "../../lib/data-mode";
import { datasets, evalRows } from "./data";
import type { EvaluationRun } from "./types";
export function useEvaluation() {
  const state = useResource<{ evaluations: EvaluationRun[] }>(
    "/api/evaluations",
    { evaluations: [] },
  );
  const [dataset, setDataset] = useState<string>(datasets[0]);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const latest = state.data?.evaluations[0] ?? null;
  const start = async () => {
    if (getDataMode() === "demo")
      throw new Error("本地演示不生成评测报告，请切换到服务端模式");
    setRunning(true);
    try {
      const result = await apiFetch<{ evaluation: EvaluationRun }>(
        "/api/evaluations",
        {
          method: "POST",
          body: JSON.stringify({ name: "检索算法演示评测", dataset }),
        },
      );
      if (result)
        state.setData((current) => ({
          evaluations: [result.evaluation, ...(current?.evaluations ?? [])],
        }));
    } finally {
      setRunning(false);
    }
  };
  return {
    ...state,
    dataset,
    setDataset,
    running,
    progress: running ? 0 : latest ? 100 : 0,
    start,
    runs: state.data?.evaluations.length ?? 0,
    latest,
    hit: latest ? (latest.metrics.hitRate * 100).toFixed(1) : "—",
    accuracy: latest ? (latest.metrics.accuracy * 100).toFixed(1) : "—",
    latency: "—",
    samples:
      latest?.records.map((r) => [
        r.question,
        r.expected,
        r.score.toFixed(2),
        r.hit ? "规则判定通过" : "待检查",
      ]) ?? (getDataMode() === "demo" ? evalRows : []),
    selected,
    setSelected,
    datasets: [...datasets],
  };
}
