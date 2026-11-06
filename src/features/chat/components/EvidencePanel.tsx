import { X } from "lucide-react";
import { IconButton } from "../../../components/ui";
import { getDataMode } from "../../../lib/data-mode";
import { DemoEvidencePanel } from "./DemoEvidencePanel";
type EvidenceTab = "source" | "retrieval" | "permission";
export function EvidencePanel(props: Parameters<typeof DemoEvidencePanel>[0]) {
  if (getDataMode() === "demo") return <DemoEvidencePanel {...props} />;
  return (
    <aside className="evidence-panel">
      <div className="evidence-tabs">
        <strong>召回片段与能力状态</strong>
        <IconButton label="收起证据面板" onClick={props.onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="evidence-content">
        <div className="info-callout">
          当前服务端使用规则检索与预置答案。真实原文定位、LLM
          和权限校验尚未接入；评分不是可信概率，阶段耗时为演示值。
        </div>
        <h3>本次召回的文本</h3>
        {props.retrieval?.hits.length ? (
          props.retrieval.hits.map((hit) => (
            <article className="retrieval-excerpt" key={hit.id}>
              <strong>{hit.title}</strong>
              <small>
                {hit.page} · {hit.scope}
              </small>
              <p>{hit.content}</p>
            </article>
          ))
        ) : (
          <p className="muted">
            没有可用的召回记录。预置来源不代表真实检索证据。
          </p>
        )}
        <div className="info-callout">
          访问控制未接入。这里不显示权限通过结论。
        </div>
      </div>
    </aside>
  );
}
