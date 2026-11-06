import {
  CheckCircle2,
  FileText,
  Fingerprint,
  FlaskConical,
  Layers3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { CapabilityNote as DemoNote } from "../components/CapabilityNote";
import { Badge, EmptyState, Modal, PageHeader } from "../components/ui";
import type { KnowledgeVersion } from "../features/knowledge/types";
import { type SearchDoc } from "../features/retrieval/searchDocs";
import { useRetrieval } from "../features/retrieval/useRetrieval";
import { useAction } from "../hooks/useAction";
import type { RetrievalHit } from "../lib/chat-data";
import "./governance.css";
type KnowledgeVersionAlias = KnowledgeVersion;

export function RetrievalPage() {
  const {
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
    scoreKey,
    runSearch,
    submitted,
  } = useRetrieval();
  const [detail, setDetail] = useState<RetrievalHit | SearchDoc | null>(null);
  const { run, pending } = useAction();
  const visibleResults = (results ?? []) as Array<RetrievalHit | SearchDoc>;
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="让每一次检索，都能被理解"
        description="对比召回策略、调节检索参数，找到知识与问题之间最准确的连接。"
        action={
          <Badge tone="purple">
            <FlaskConical size={13} />
            检索实验室
          </Badge>
        }
      />
      <div className="gp-retrieval-layout">
        <div>
          <section className="panel gp-retrieval-query">
            <div className="gp-section-eyebrow">
              <Search size={16} />
              测试问题
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => runSearch());
              }}
            >
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="检索问题"
                placeholder="输入一个问题，观察知识是如何被找到的…"
                required
              />
              <div>
                <span>身份校验尚未接入</span>
                <button
                  className="btn btn-primary"
                  disabled={running || !query.trim()}
                  type="submit"
                >
                  <Search size={16} />
                  {running ? "正在检索…" : "开始检索"}
                </button>
              </div>
            </form>
          </section>
          <section className="panel gp-panel gp-results">
            <div className="tabs gp-tabbar">
              {["混合检索", "BM25", "向量检索"].map((s) => (
                <button
                  key={s}
                  className={`tab ${strategy === s ? "active" : ""}`}
                  onClick={() => {
                    setStrategy(s);
                    if (results !== null)
                      void run(() => runSearch({ strategy: s }));
                  }}
                >
                  {s}
                </button>
              ))}
              <span className="gp-result-count">
                {visibleResults.length} 个相关分块
              </span>
            </div>
            <div className="gp-results-summary">
              {submitted && (
                <span>
                  已提交：{submitted.scope} · Top {submitted.topK} · 阈值{" "}
                  {submitted.threshold}
                </span>
              )}
              <span>
                <CheckCircle2 size={14} />
                权限预过滤未接入
              </span>
              <span>
                {running
                  ? "检索中…"
                  : elapsed !== null
                    ? `耗时 ${elapsed} ms · 服务端结果`
                    : "尚未执行服务端查询"}
              </span>
            </div>
            {visibleResults.length ? (
              visibleResults.map((doc, i) => (
                <button
                  className="gp-result-card"
                  key={`${doc.title}-${i}`}
                  onClick={() => setDetail(doc)}
                >
                  <div className="gp-result-title">
                    <span className="gp-rank">{i + 1}</span>
                    <FileText size={18} />
                    <strong>{doc.title}</strong>
                    <span className="gp-score-pill">
                      {Number(doc[scoreKey]).toFixed(2)}
                    </span>
                  </div>
                  <p>{doc.content}</p>
                  <div className="gp-result-meta">
                    <span>{doc.section}</span>
                    <span>{doc.page}</span>
                    <span>
                      <ShieldCheck size={13} />
                      授权待校验
                    </span>
                  </div>
                  <div className="gp-scorebar">
                    <div
                      style={{
                        width: `${Number(doc[scoreKey]) * 100}%`,
                      }}
                    />
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="未找到符合条件的知识"
                description="试试“年假”“报销”“入职”或“项目归档”，也可以切换知识范围或降低相关性阈值。"
              />
            )}
          </section>
        </div>
        <aside className="panel gp-retrieval-settings">
          <div className="gp-section-eyebrow">
            <SlidersHorizontal size={17} />
            检索参数
          </div>
          <label className="field">
            知识范围
            <select
              className="select"
              aria-label="检索知识范围"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {["全部知识库", "企业制度", "项目资料"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            召回数量 Top K
            <span className="gp-range-label">
              <span>1</span>
              <strong>{topK}</strong>
              <span>10</span>
            </span>
            <input
              type="range"
              min="1"
              max="10"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              aria-label="召回数量"
            />
          </label>
          <label className="field">
            相关性阈值
            <span className="gp-range-label">
              <span>0</span>
              <strong>{threshold.toFixed(2)}</strong>
              <span>1</span>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              aria-label="相关性阈值"
            />
          </label>
          <div className="gp-retrieval-stages">
            <h4>目标检索链路（待接入）</h4>
            {[
              {
                icon: <Fingerprint size={16} />,
                name: "身份与权限预过滤",
                info: "先过滤，再召回",
              },
              {
                icon: <Search size={16} />,
                name: "BM25 + 向量召回",
                info: "关键词与语义双路召回",
              },
              {
                icon: <Layers3 size={16} />,
                name: "Rerank 精排",
                info: "bge-reranker-v2-m3",
              },
              {
                icon: <ShieldCheck size={16} />,
                name: "权限二次校验",
                info: "仅授权证据进入上下文",
              },
            ].map((s) => (
              <div key={s.name}>
                {s.icon}
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.info}</small>
                </span>
              </div>
            ))}
          </div>
          <DemoNote>
            当前使用规则检索；向量模型与 Rerank 尚未接入。耗时仅表示本次 HTTP
            往返，不代表模型阶段延迟。
          </DemoNote>
        </aside>
      </div>
      {detail && (
        <Modal title="召回分块详情" onClose={() => setDetail(null)}>
          <div className="gp-inline">
            <FileText size={22} />
            <h3>{detail.title}</h3>
          </div>
          <p className="muted">
            {detail.section} · {detail.page}
          </p>
          <div className="gp-query-box gp-readable">{detail.content}</div>
          <div className="gp-three-scores">
            {[
              ["BM25", detail.bm25],
              ["语义规则分数", detail.dense],
              ["融合规则分数", detail.rerank],
            ].map(([label, score]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{Number(score).toFixed(2)}</strong>
              </div>
            ))}
          </div>
          <DemoNote>当前接口不提供已验证的租户与密级信息。</DemoNote>
        </Modal>
      )}
    </div>
  );
}
