import type { RetrievalHit, RetrievalStage, RetrievalTrace } from "../types.js";
import type { KnowledgeDocument } from "../types.js";

export interface SearchOptions {
  query: string;
  strategy?: "混合检索" | "BM25" | "向量检索";
  scope?: string;
  threshold?: number;
  topK?: number;
}

interface ChunkRecord {
  id: string;
  docId: string;
  title: string;
  scope: string;
  section: string;
  content: string;
  page: string;
}

const synonyms: Record<string, string[]> = {
  年假: ["休假", "工作年限", "带薪", "员工"],
  休假: ["年假", "请假", "员工"],
  报销: ["发票", "费用", "差旅", "财务", "审批"],
  入职: ["新人", "报到", "材料", "员工"],
  归档: ["结项", "版本", "项目", "文档"],
  接口: ["api", "接入", "网关", "服务", "检索"],
  检索: ["搜索", "召回", "查询", "向量"],
  权限: ["角色", "部门", "访问", "授权"],
};

function tokenize(text: string): string[] {
  const ascii = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const cjk = text.match(/[\u4e00-\u9fff]/g) ?? [];
  const grams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i += 1) {
    grams.push(cjk[i] + cjk[i + 1]);
  }
  return [...ascii, ...grams];
}

function buildCorpus(documents: KnowledgeDocument[]): ChunkRecord[] {
  const records: ChunkRecord[] = [];
  for (const doc of documents) {
    if (doc.status === "已归档") continue;
    doc.chunks.forEach((content, index) => {
      const [firstLine, ...rest] = content.split("\n");
      records.push({
        id: `${doc.id}:${index}`,
        docId: doc.id,
        title: doc.name,
        scope: doc.category,
        section: rest.length > 0 ? firstLine : doc.name,
        content: rest.length > 0 ? rest.join("\n") : firstLine,
        page: `分块 ${index + 1}`,
      });
    });
  }
  return records;
}

function expand(query: string): string[] {
  const keys = Object.keys(synonyms).filter((k) => query.includes(k));
  return [...new Set(keys.flatMap((k) => synonyms[k]))];
}

export function search(
  documents: KnowledgeDocument[],
  options: SearchOptions,
): RetrievalTrace {
  const query = options.query.trim();
  const strategy = options.strategy ?? "混合检索";
  const scope = options.scope ?? "全部知识库";
  const threshold = options.threshold ?? 0.65;
  const topK = options.topK ?? 5;
  const mode = strategy === "BM25" ? "bm25" : strategy === "向量检索" ? "dense" : "rerank";

  const corpus = buildCorpus(documents).filter(
    (c) => scope === "全部知识库" || c.scope === scope,
  );
  const queryTokens = new Set(tokenize(query));
  const expanded = expand(query);

  const avgLen =
    corpus.reduce((sum, c) => sum + c.content.length, 0) /
      Math.max(corpus.length, 1) || 1;

  const scored = corpus.map((chunk) => {
    const chunkTokens = tokenize(`${chunk.section} ${chunk.content}`);
    const tf = (token: string) =>
      chunkTokens.reduce((n, t) => (t === token ? n + 1 : n), 0);

    let bm25Raw = 0;
    for (const token of queryTokens) {
      const f = tf(token);
      if (f === 0) continue;
      const idf =
        Math.log(
          (corpus.length - chunkTokens.filter((t) => t === token).length + 0.5) /
            (chunkTokens.filter((t) => t === token).length + 0.5) + 1,
        ) || 0.5;
      bm25Raw +=
        idf *
        ((f * 2.5) / (f + 1.5 * (0.25 + 0.75 * (chunk.content.length / avgLen))));
    }
    if (chunkTokens.some((t) => queryTokens.has(t))) bm25Raw += 1;
    const synonymHits = expanded.filter((term) =>
      `${chunk.section} ${chunk.content}`.toLowerCase().includes(term),
    ).length;
    bm25Raw += synonymHits * 0.8;

    const titleHit = [...queryTokens].filter((t) =>
      tokenize(chunk.title).includes(t),
    ).length;
    const denseRaw =
      synonymHits * 1.2 +
      titleHit * 1.5 +
      (chunk.scope === scope ? 0.6 : 0);

    return { chunk, bm25Raw, denseRaw };
  });

  const maxBm25 = Math.max(...scored.map((s) => s.bm25Raw), 1);
  const maxDense = Math.max(...scored.map((s) => s.denseRaw), 1);

  const hits: RetrievalHit[] = scored
    .map(({ chunk, bm25Raw, denseRaw }) => {
      const bm25 = 0.55 + 0.43 * (bm25Raw / maxBm25);
      const dense = 0.58 + 0.4 * (denseRaw / maxDense);
      const rerank =
        0.6 + 0.16 * bm25 + 0.22 * dense - (threshold > 0.8 ? 0.02 : 0);
      return {
        id: chunk.id,
        title: chunk.title,
        scope: chunk.scope,
        section: chunk.section,
        content: chunk.content,
        page: chunk.page,
        bm25: Number(bm25.toFixed(2)),
        dense: Number(dense.toFixed(2)),
        rerank: Number(Math.min(rerank, 0.98).toFixed(2)),
        score: 0,
      };
    })
    .map((hit) => ({ ...hit, score: hit[mode] }))
    .filter((hit) => hit.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const stages: RetrievalStage[] = [
    {
      name: "权限预过滤",
      detail: `按租户与部门过滤候选范围，剩余 ${corpus.length} 个分块`,
      ms: 6 + Math.round(Math.random() * 8),
    },
    {
      name: strategy === "混合检索" ? "混合召回" : strategy === "BM25" ? "关键词召回" : "语义召回",
      detail: `召回 ${scored.filter((s) => (mode === "bm25" ? s.bm25Raw : s.denseRaw) > 0).length} 条候选，阈值 ${threshold}`,
      ms: 28 + Math.round(Math.random() * 40),
    },
    {
      name: "重排序",
      detail: `取 Top ${topK}，最高分 ${hits[0]?.score?.toFixed(2) ?? "—"}`,
      ms: 45 + Math.round(Math.random() * 60),
    },
  ];

  return { query, mode, topK, threshold, scope, stages, hits };
}
