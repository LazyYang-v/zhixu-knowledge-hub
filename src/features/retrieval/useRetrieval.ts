import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { RetrievalHit, RetrievalTrace } from "../../lib/chat-data";
import { searchDocs } from "./searchDocs";
export interface RetrievalParams {
  query: string;
  strategy: string;
  scope: string;
  threshold: number;
  topK: number;
}
export function useRetrieval() {
  const [query, setQuery] = useState("公司的员工年假制度是什么？");
  const [searched, setSearched] = useState("");
  const [strategy, setStrategy] = useState("混合检索");
  const [scope, setScope] = useState("全部知识库");
  const [threshold, setThreshold] = useState(0.65);
  const [topK, setTopK] = useState(5);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RetrievalHit[] | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState<RetrievalParams | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const scoreKey =
    (submitted?.strategy ?? strategy) === "BM25"
      ? "bm25"
      : (submitted?.strategy ?? strategy) === "向量检索"
        ? "dense"
        : "rerank";
  const runSearch = async (overrides?: Partial<RetrievalParams>) => {
    const params = { query, strategy, scope, threshold, topK, ...overrides };
    if (!params.query.trim()) return;
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setRunning(true);
    const started = performance.now();
    try {
      const data = await apiFetch<{ trace: RetrievalTrace }>(
        "/api/retrieval/search",
        { method: "POST", body: JSON.stringify(params), signal: active.signal },
      );
      if (active.signal.aborted) return;
      const demoHits = searchDocs
        .filter(
          (doc) =>
            (params.scope === "全部知识库" || doc.scope === params.scope) &&
            doc.tags.some((tag) => params.query.includes(tag)),
        )
        .map((doc, index) => ({
          id: doc.id ?? `demo-${index}`,
          title: doc.title,
          scope: doc.scope,
          section: doc.section,
          content: doc.content,
          page: doc.page,
          bm25: doc.bm25,
          dense: doc.dense,
          rerank: doc.rerank,
          score:
            doc[
              params.strategy === "BM25"
                ? "bm25"
                : params.strategy === "向量检索"
                  ? "dense"
                  : "rerank"
            ],
        }))
        .filter((doc) => doc.score >= params.threshold)
        .slice(0, params.topK);
      setResults(data?.trace.hits ?? demoHits);
      setElapsed(data ? Math.round(performance.now() - started) : null);
      setSearched(params.query);
      setSubmitted(params);
    } finally {
      if (controller.current === active) setRunning(false);
    }
  };
  return {
    query,
    setQuery,
    searched,
    strategy,
    setStrategy,
    scope,
    setScope,
    threshold,
    setThreshold,
    topK,
    setTopK,
    running,
    results,
    elapsed,
    submitted,
    scoreKey,
    runSearch,
  };
}
export type { RetrievalHit };
