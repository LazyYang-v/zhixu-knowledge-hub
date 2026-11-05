import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";
import { datasets, evalRows } from "./data";
import type { EvaluationRun } from "./types";

export function useEvaluation() {
  const [dataset, setDataset] = useState<string>(datasets[0]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runs, setRuns] = useLocalStorage<number>("evaluation-runs", 0);
  const [latest, setLatest] = useState<EvaluationRun | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const evalLoaded = useRef(false);
  useEffect(() => {
    if (evalLoaded.current) return;
    evalLoaded.current = true;
    apiFetch<{ evaluations: EvaluationRun[] }>("/api/evaluations").then(
      (data) => {
        if (data?.evaluations.length) setLatest(data.evaluations[0]);
      },
    );
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setProgress((p) => Math.min(p + 8, 100)),
      150,
    );
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!running || progress !== 100) return;
    void (async () => {
      const data = await apiFetch<{ evaluation: EvaluationRun }>(
        "/api/evaluations",
        {
          method: "POST",
          body: JSON.stringify({ name: `质量评测 · ${dataset}`, dataset }),
        },
      );
      if (data?.evaluation) setLatest(data.evaluation);
      setRunning(false);
      setRuns((n) => n + 1);
    })();
  }, [running, progress, dataset, setRuns]);
  const base =
    dataset === datasets[0] ? 96.8 : dataset === datasets[1] ? 94.2 : 93.6;
  const hit = latest
    ? (latest.metrics.hitRate * 100).toFixed(1)
    : (base + Math.min(runs, 5) * 0.1).toFixed(1);
  const accuracy = latest
    ? (latest.metrics.accuracy * 100).toFixed(1)
    : (base - 2.6).toFixed(1);
  const latency = latest ? (latest.metrics.latency / 1000).toFixed(2) : "1.24";
  const samples: string[][] =
    latest?.records.length
      ? latest.records.map((r) => [
          r.question,
          r.expected,
          r.score.toFixed(2),
          r.hit ? "通过" : "待优化",
        ])
      : dataset === datasets[0]
        ? evalRows
        : dataset === datasets[1]
          ? [
              ["如何配置服务的健康检查？", "微服务部署指南.md", "0.96", "通过"],
              ["API 调用的限流阈值是多少？", "API 接口规范.md", "0.92", "通过"],
              ["数据库迁移失败如何回滚？", "数据库运维手册.pdf", "0.94", "通过"],
              ["跨区域容灾切换需要多久？", "服务高可用设计.md", "0.86", "待优化"],
            ]
          : [
              ["项目复盘应包含哪些内容？", "项目复盘模板.docx", "0.95", "通过"],
              ["项目文档的归档期限是什么？", "项目文档管理规范.md", "0.94", "通过"],
              ["需求变更由谁审批？", "项目交付流程.pdf", "0.92", "通过"],
              ["历史项目资料如何申请访问？", "项目权限规范.pdf", "0.87", "待优化"],
            ];
  const start = () => {
    setProgress(0);
    setRunning(true);
  };
  return {
    dataset,
    setDataset,
    running,
    progress,
    start,
    runs,
    latest,
    hit,
    accuracy,
    latency,
    samples,
    selected,
    setSelected,
    datasets: [...datasets],
  };
}
