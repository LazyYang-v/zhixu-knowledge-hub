import { useEffect, useRef } from "react";
import type { KnowledgeDocument } from "./types";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";

export function useDocumentAdvanceTimer(
  docs: KnowledgeDocument[],
  setDocs: (updater: (current: KnowledgeDocument[]) => KnowledgeDocument[]) => void,
) {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const hasRunning = docs.some((d) => d.task === "running");
  useEffect(() => {
    if (!hasRunning || !mountedRef.current) return;
    const timer = setInterval(() => {
      setDocs((current) =>
        current.map((d) =>
          d.task !== "running"
            ? d
            : {
                ...d,
                stage: Math.min(d.stage + 1, 4),
                task: d.stage >= 3 ? "done" : "running",
              },
        ),
      );
      docs
        .filter((d) => d.task === "running")
        .forEach((d) => {
          apiFetch(`/api/knowledge/documents/${d.id}/advance`, {
            method: "POST",
          });
        });
    }, 900);
    return () => clearInterval(timer);
  }, [hasRunning, docs, setDocs]);
}
