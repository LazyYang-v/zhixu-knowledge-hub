import { useEffect, useState } from "react";
import { useResource } from "../../hooks/useResource";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { apiFetch } from "../../lib/api";
import { useDataState } from "../../lib/storage";
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
  const [local, setLocal] = useDataState<WorkspaceSettings>(
    "settings",
    defaultSettings,
    defaultSettings,
  );
  const state = useResource<{ settings: WorkspaceSettings }>("/api/settings", {
    settings: local,
  });
  const [form, setForm] = useState<WorkspaceSettings>(local);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("工作空间");
  const [integration, setIntegration] = useState<string | null>(null);
  useEffect(() => {
    if (state.data && !dirty) setForm(state.data.settings);
  }, [state.data, dirty]);
  useUnsavedChanges(dirty);
  const change = <K extends keyof WorkspaceSettings>(
    key: K,
    value: WorkspaceSettings[K],
  ) => {
    setDirty(true);
    setForm((previous) => ({ ...previous, [key]: value }));
  };
  const save = async () => {
    if (!form.workspace.trim()) throw new Error("请输入工作空间名称");
    const size = Number(form.chunkSize),
      overlap = Number(form.overlap),
      topK = Number(form.topK);
    if (
      !Number.isInteger(size) ||
      size < 64 ||
      size > 4096 ||
      !Number.isInteger(overlap) ||
      overlap < 0 ||
      overlap >= size ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 20
    )
      throw new Error("请检查分块长度、重叠长度和召回数量");
    const data = await apiFetch<{ settings: WorkspaceSettings }>(
      "/api/settings",
      { method: "PUT", body: JSON.stringify(form) },
    );
    const saved = data?.settings ?? form;
    if (data) state.setData(data);
    else setLocal(saved);
    let preferencesSaved = true;
    try {
      for (const [key, value] of [
        ["citations", saved.citations],
        ["multi-turn", saved.multiTurn],
      ] as const)
        localStorage.setItem(`knowledge-hub:${key}`, JSON.stringify(value));
    } catch {
      preferencesSaved = false;
    }
    window.dispatchEvent(new Event("knowledge-hub:preferences"));
    setForm(saved);
    setDirty(false);
    return data
      ? preferencesSaved
        ? "server"
        : "server-preferences-unavailable"
      : "offline";
  };
  return {
    ...state,
    tab,
    setTab,
    integration,
    setIntegration,
    form,
    change,
    save,
    dirty,
  };
}
