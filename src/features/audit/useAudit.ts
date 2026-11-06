import { useState } from "react";
import { useResource } from "../../hooks/useResource";
import { auditLogs } from "./data";
import type { AuditLog } from "./types";
export function useAudit() {
  const state = useResource<{ logs: AuditLog[] }>("/api/audit", {
    logs: auditLogs,
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部操作");
  const [status, setStatus] = useState("全部状态");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const logs = state.data?.logs ?? [];
  const filtered = logs.filter(
    (log) =>
      `${log.user}${log.content}${log.id}${log.targetId ?? ""}${log.requestId ?? ""}`.includes(
        query.trim(),
      ) &&
      (filter === "全部操作" || log.action === filter) &&
      (status === "全部状态" || log.status === status),
  );
  return {
    ...state,
    logs,
    query,
    setQuery,
    filter,
    setFilter,
    status,
    setStatus,
    selected,
    setSelected,
    filtered,
  };
}
