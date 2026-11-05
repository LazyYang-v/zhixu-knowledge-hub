import { FileText } from "lucide-react";
import type { KnowledgeDocument } from "./types";

export function DocIcon({ type }: { type: string }) {
  return (
    <span className={`kp-doc-icon kp-doc-${type.toLowerCase()}`}>
      <FileText size={20} />
      <small>{type}</small>
    </span>
  );
}

export function statusTone(status: KnowledgeDocument["status"]) {
  return status === "已发布"
    ? "success"
    : status === "草稿"
      ? "warning"
      : "neutral";
}
