import { useEffect, useRef, useState } from "react";
import type { AuditLog } from "./types";
import { auditLogs } from "./data";
import { apiFetch } from "../../lib/api";

export function useAudit() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部操作");
  const [status, setStatus] = useState("全部状态");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>(auditLogs);
  const logsLoaded = useRef(false);
  useEffect(() => {
    if (logsLoaded.current) return;
    logsLoaded.current = true;
    apiFetch<{ logs: AuditLog[] }>("/api/audit").then((data) => {
      if (!data?.logs.length) return;
      setLogs(
        data.logs.map((log) => ({
          ...log,
          time: new Date(log.time).toLocaleTimeString("zh-CN", {
            hour12: false,
          }),
          status: log.status === "正常" ? "通过" : "已拦截",
        })),
      );
    });
  }, []);
  const filtered = logs.filter(
    (log) =>
      `${log.user}${log.content}${log.id}`.includes(query.trim()) &&
      (filter === "全部操作" || log.action === filter) &&
      (status === "全部状态" || log.status === status),
  );
  return {
    logs,
    setLogs,
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
