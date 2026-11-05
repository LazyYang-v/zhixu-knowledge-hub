import { useMemo } from "react";
import type { KnowledgeDocument } from "../knowledge/types";
import { seedDocuments } from "../knowledge/seed";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";
import { STORAGE_KEYS } from "../knowledge/data";

export type TaskFilter = "全部任务" | "处理中" | "已完成" | "失败";

const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
const today = () => new Date().toLocaleDateString("sv-SE");

export function useTasks() {
  const [docs, setDocs] = useLocalStorage<KnowledgeDocument[]>(
    STORAGE_KEYS.documents,
    seedDocuments,
  );
  const [failures, setFailures] = useLocalStorage<boolean>(
    STORAGE_KEYS.taskFailures,
    true,
  );
  const errorDoc = useMemo<KnowledgeDocument>(
    () => ({
      ...seedDocuments[0],
      id: "failed-demo",
      name: "历史采购合同扫描件.pdf",
      task: "error",
      stage: 0,
      size: "12.6 MB",
      status: "草稿",
      chunks: ["该扫描件的识别结果将在接入 OCR 服务后生成。"],
      versions: [
        {
          version: "v1.0",
          date: today(),
          note: "首次导入",
          chunks: ["该扫描件的识别结果将在接入 OCR 服务后生成。"],
        },
      ],
    }),
    [],
  );
  const hasServerError = docs.some((d) => d.task === "error");
  const allTasks = [...(failures && !hasServerError ? [errorDoc] : []), ...docs];
  const retry = (item: KnowledgeDocument) => {
    if (item.id === "failed-demo") {
      setFailures(false);
      setDocs((current) => [
        { ...item, id: crypto.randomUUID(), stage: 0, task: "running" },
        ...current,
      ]);
    } else {
      apiFetch(`/api/knowledge/documents/${item.id}/retry`, {
        method: "POST",
      });
      setDocs((current) =>
        current.map((d) =>
          d.id === item.id ? { ...d, stage: 0, task: "running" } : d,
        ),
      );
    }
  };
  return { stages, docs, setDocs, allTasks, retry };
}
