import { useEffect, useRef, useState } from "react";
import type { RetrievalHit, RetrievalTrace } from "../../lib/chat-data";
import { apiFetch } from "../../lib/api";
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
  const [searched, setSearched] = useState(query);
  const [strategy, setStrategy] = useState("混合检索");
  const [scope, setScope] = useState("全部知识库");
  const [threshold, setThreshold] = useState(0.65);
  const [topK, setTopK] = useState(5);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<
    Array<RetrievalHit | Awaited<ReturnType<typeof toHit>>> | null
  >(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const capturedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(capturedTimer.current), []);
  const scoreKey =
    strategy === "BM25"
      ? "bm25"
      : strategy === "向量检索"
        ? "dense"
        : "rerank";
  const found = filterDocs(scoreKey);
  const runSearch = async (overrides?: Partial<RetrievalParams>) => {
    const params = {
      query: overrides?.query ?? query,
      strategy: overrides?.strategy ?? strategy,
      scope: overrides?.scope ?? scope,
      threshold: overrides?.threshold ?? threshold,
      topK: overrides?.topK ?? topK,
    };
    if (!params.query.trim()) return;
    setRunning(true);
    const startedAt = Date.now();
    const data = await apiFetch<{ trace: RetrievalTrace }>(
      "/api/retrieval/search",
      { method: "POST", body: JSON.stringify(params) },
    );
    const apiElapsed =
      data?.trace.stages.reduce((sum, stage) => sum + stage.ms, 0) ?? 0;
    capturedTimer.current = setTimeout(() => {
      setSearched(params.query.trim());
      setResults(data?.trace.hits ?? null);
      setElapsed(data ? apiElapsed : null);
      setRunning(false);
    }, Math.max(0, 650 - (Date.now() - startedAt)));
  };
  return {
    ...{
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
      found,
      scoreKey,
      runSearch,
    },
  };
}

type Searchable = (typeof searchDocs)[number];
type HitLike = Searchable & Partial<RetrievalHit>;

function filterDocs(scoreKey: "bm25" | "dense" | "rerank") {
  return (
    scope: string,
    searched: string,
    threshold: number,
    topK: number,
  ) =>
    searchDocs
      .filter(
        (doc) =>
          (scope === "全部知识库" || doc.scope === scope) &&
          doc.tags.some((tag) => searched.includes(tag)) &&
          doc[scoreKey] >= threshold,
      )
      .sort((a, b) => b[scoreKey] - a[scoreKey])
      .slice(0, topK);
}

const fakeDoc: RetrievalHit = {
  id: "",
  title: "",
  scope: "",
  section: "",
  content: "",
  page: "",
  bm25: 0,
  dense: 0,
  rerank: 0,
  score: 0,
};

async function toHit(ref: unknown) {
  return ref as RetrievalHit;
}

export type { HitLike, RetrievalHit };
export { fakeDoc };
