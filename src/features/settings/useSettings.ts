import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";
import type { WorkspaceSettings } from "./types";

export const defaultSettings: WorkspaceSettings = {
  workspace: "企业知识工作空间",
  tenant: "enterprise-001",
  embedding: "bge-m3",
  vector: "pgvector",
  chunkSize: "512",
  overlap: "64",
  strategy: "父子分块",
  topK: "5",
  rerank: true,
  citations: true,
  multiTurn: true,
  audit: true,
};

export function useSettings() {
  const [saved, setSaved] = useLocalStorage<WorkspaceSettings>(
    "settings",
    defaultSettings,
  );
  const [form, setForm] = useState<WorkspaceSettings>(saved);
  const [tab, setTab] = useState("工作空间");
  const [integration, setIntegration] = useState<string | null>(null);
  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (settingsLoaded.current) return;
    settingsLoaded.current = true;
    apiFetch<{ settings: WorkspaceSettings }>("/api/settings").then(
      (data) => {
        if (data?.settings) {
          setSaved(data.settings);
          setForm(data.settings);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const change = <K extends keyof WorkspaceSettings>(
    key: K,
    value: WorkspaceSettings[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    if (!form.workspace.trim()) return "empty" as const;
    const size = Number(form.chunkSize);
    const overlap = Number(form.overlap);
    if (size < 64 || size > 4096 || overlap < 0 || overlap >= size)
      return "range" as const;
    const data = await apiFetch<{ settings: WorkspaceSettings }>(
      "/api/settings",
      { method: "PUT", body: JSON.stringify(form) },
    );
    if (data?.settings) {
      setSaved(data.settings);
      setForm(data.settings);
      return "server" as const;
    }
    setSaved(form);
    try {
      localStorage.setItem(
        "knowledge-hub:citations",
        JSON.stringify(form.citations),
      );
      localStorage.setItem(
        "knowledge-hub:multi-turn",
        JSON.stringify(form.multiTurn),
      );
      return "offline" as const;
    } catch {
      return "no-storage" as const;
    }
  };
  return {
    tab,
    setTab,
    integration,
    setIntegration,
    form,
    change,
    save,
  };
}
