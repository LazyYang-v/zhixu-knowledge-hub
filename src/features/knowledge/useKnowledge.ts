import { useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "../knowledge/data";
import { seedDocuments } from "../../features/knowledge/seed";
import type { KnowledgeDocument, KnowledgeVersion } from "./types";
import { apiFetch } from "../../lib/api";
import { useLocalStorage } from "../../lib/storage";
import { useDocumentAdvanceTimer } from "./useDocumentState";

const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => new Date().toLocaleDateString("sv-SE");

export function versionNext(doc: KnowledgeDocument) {
  return `v${Math.max(
    ...doc.versions.map((v) => Number(v.version.replace("v", ""))),
  ) + 1}.0`;
}

export function useKnowledgeDocuments() {
  const [docs, setDocs] = useLocalStorage<KnowledgeDocument[]>(
    STORAGE_KEYS.documents,
    seedDocuments,
  );
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    apiFetch<{ documents: KnowledgeDocument[] }>(
      "/api/knowledge/documents",
    ).then((data) => {
      if (data?.documents.length) setDocs(data.documents);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useDocumentAdvanceTimer(docs, setDocs);
  const saveChunk = async (
    docId: string,
    chunks: string[],
    versions: KnowledgeVersion[],
  ) => {
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return null;
    for (let i = 0; i < chunks.length; i += 1) {
      if (chunks[i] === doc.chunks[i]) continue;
      const data = await apiFetch<{
        document: KnowledgeDocument;
        version: string;
      }>(`/api/knowledge/documents/${docId}/chunks/${i}`, {
        method: "PUT",
        body: JSON.stringify({ content: chunks[i] }),
      });
      if (data) {
        setDocs((current) =>
          current.map((d) => (d.id === docId ? data.document : d)),
        );
        return data.document;
      }
    }
    const version = versionNext(doc);
    setDocs((current) =>
      current.map((d) =>
        d.id === docId
          ? {
              ...d,
              chunks: [...chunks],
              date: today(),
              stage: 0,
              task: "running",
              versions: [
                {
                  version,
                  date: today(),
                  note: "编辑知识分块，重新生成演示索引",
                  chunks: [...chunks],
                },
                ...d.versions,
              ],
            }
          : d,
      ),
    );
    return null;
  };
  const rollback = async (
    docId: string,
    target: KnowledgeVersion,
  ) => {
    const data = await apiFetch<{ document: KnowledgeDocument }>(
      `/api/knowledge/documents/${docId}/rollback`,
      { method: "POST", body: JSON.stringify({ version: target.version }) },
    );
    if (data) {
      setDocs((current) =>
        current.map((d) => (d.id === docId ? data.document : d)),
      );
      return data.document;
    }
    setDocs((current) =>
      current.map((d) =>
        d.id === docId
          ? {
              ...d,
              chunks: [...target.chunks],
              date: today(),
              stage: 0,
              task: "running",
              versions: [
                {
                  version: versionNext(d),
                  date: today(),
                  note: `回滚至 ${target.version}`,
                  chunks: [...target.chunks],
                },
                ...d.versions,
              ],
            }
          : d,
      ),
    );
    return null;
  };
  const changeStatus = async (doc: KnowledgeDocument) => {
    const nextStatus =
      doc.status === "已发布" ? "已归档" : "已发布";
    apiFetch(
      `/api/knowledge/documents/${doc.id}/${doc.status === "已发布" ? "archive" : "publish"}`,
      { method: "POST" },
    );
    setDocs((current) =>
      current.map((d) =>
        d.id === doc.id ? { ...d, status: nextStatus } : d,
      ),
    );
  };
  return {
    docs,
    setDocs,
    saveChunk,
    rollback,
    changeStatus,
  };
}
