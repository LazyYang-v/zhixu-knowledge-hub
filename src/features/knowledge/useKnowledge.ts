import { useCollection } from "../../hooks/useCollection";
import { apiFetch } from "../../lib/api";
import { seedDocuments } from "./seed";
import type { KnowledgeDocument, KnowledgeVersion } from "./types";
import { useDocumentAdvanceTimer } from "./useDocumentState";
export function versionNext(doc: KnowledgeDocument) {
  const latest = doc.versions[0]?.version ?? "v0.0";
  const [major, minor = "0"] = latest.replace("v", "").split(".");
  return `v${major}.${Number(minor) + 1}`;
}
export function useKnowledgeDocuments() {
  const state = useCollection<KnowledgeDocument, "documents">(
    "/api/knowledge/documents",
    "documents",
    "documents-v1",
    seedDocuments,
  );
  const docs = state.records;
  const setDocs = state.setRecords;
  useDocumentAdvanceTimer(docs, setDocs);
  const replace = (doc: KnowledgeDocument) =>
    setDocs((current) =>
      doc.redacted
        ? current.filter((item) => item.id !== doc.id)
        : current.map((item) => (item.id === doc.id ? doc : item)),
    );
  const saveChunk = async (
    id: string,
    chunks: string[],
    expectedRevision?: number,
  ) => {
    const doc = docs.find((item) => item.id === id);
    if (!doc) throw new Error("文档不存在");
    if (
      expectedRevision !== undefined &&
      doc.revision !== undefined &&
      expectedRevision !== doc.revision
    )
      throw new Error("文档已更新，请刷新并比较草稿后再提交");
    if (
      chunks.length === doc.chunks.length &&
      chunks.every((chunk, index) => chunk === doc.chunks[index])
    )
      return doc;
    const data = await apiFetch<{
      document: KnowledgeDocument;
      version: string;
    }>(`/api/knowledge/documents/${id}/chunks`, {
      method: "PUT",
      body: JSON.stringify({
        chunks,
        revision: expectedRevision ?? doc.revision ?? 1,
      }),
    });
    const result = data?.document ?? {
      ...doc,
      chunks: [...chunks],
      versions: [
        {
          version: versionNext(doc),
          date: new Date().toISOString().slice(0, 10),
          note: "批量编辑分块",
          chunks: [...chunks],
        },
        ...doc.versions,
      ],
    };
    replace(result);
    return result;
  };
  const rollback = async (id: string, target: KnowledgeVersion) => {
    const doc = docs.find((item) => item.id === id);
    if (!doc) throw new Error("文档不存在");
    const data = await apiFetch<{ document: KnowledgeDocument }>(
      `/api/knowledge/documents/${id}/rollback`,
      {
        method: "POST",
        body: JSON.stringify({
          version: target.version,
          revision: doc.revision ?? 1,
        }),
      },
    );
    const result = data?.document ?? {
      ...doc,
      chunks: [...target.chunks],
      versions: [
        {
          ...target,
          version: versionNext(doc),
          note: `回滚至 ${target.version}`,
        },
        ...doc.versions,
      ],
    };
    replace(result);
    return result;
  };
  const changeStatus = async (doc: KnowledgeDocument) => {
    const action = doc.status === "已发布" ? "archive" : "publish";
    const data = await apiFetch<{ document: KnowledgeDocument }>(
      `/api/knowledge/documents/${doc.id}/${action}`,
      { method: "POST", body: JSON.stringify({ revision: doc.revision ?? 1 }) },
    );
    replace(
      data?.document ?? {
        ...doc,
        status: action === "archive" ? "已归档" : "已发布",
      },
    );
  };
  return { ...state, docs, setDocs, saveChunk, rollback, changeStatus };
}
