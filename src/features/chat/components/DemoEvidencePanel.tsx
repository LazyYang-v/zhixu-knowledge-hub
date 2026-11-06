import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  LockKeyhole,
  Maximize2,
  Minus,
  PanelRightClose,
  Plus,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, IconButton, Modal } from "../../../components/ui";
import type { AnswerKind, RetrievalTrace } from "../../../lib/chat-data";
import { sourceFor } from "../../../lib/chat-data";
import { FileIcon } from "./FileIcon";
type EvidenceTab = "source" | "retrieval" | "permission";
export function DemoEvidencePanel({
  kind,
  sourceIndex,
  tab,
  setTab,
  onClose,
  retrieval,
}: {
  kind: AnswerKind;
  sourceIndex: number;
  tab: EvidenceTab;
  setTab: (tab: EvidenceTab) => void;
  onClose: () => void;
  retrieval?: RetrievalTrace;
}) {
  const source = sourceFor(kind, sourceIndex === 1);
  const sourceCount = ["leave", "carry", "apply"].includes(kind) ? 2 : 1;
  const [page, setPage] = useState(source.page);
  const [zoom, setZoom] = useState(100);
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState(false);
  const [metadata, setMetadata] = useState(true);
  const stageTime = (retrieval?.stages ?? []).reduce((s, st) => s + st.ms, 0);
  const totalTime = retrieval ? (stageTime / 1000).toFixed(1) + " s" : "1.2 s";
  const steps = retrieval
    ? [
        ...retrieval.stages.map((s) => ({
          title: s.name,
          description: s.detail,
          time: `${s.ms} ms`,
        })),
        {
          title: "生成有据可依的回答",
          description: `选取 ${sourceCount} 份文档构建回答上下文`,
          time: "服务端完成",
        },
      ]
    : [
        {
          title: "身份识别与权限预过滤",
          description: "租户：知序科技 · 研发部 · 内部 L2",
          time: "24 ms",
        },
        {
          title: "混合检索",
          description: "BM25 关键词召回 + 稠密向量召回",
          time: "186 ms",
        },
        {
          title: "Rerank 重排序",
          description: "合并 24 个候选，保留 12 个相关片段",
          time: "152 ms",
        },
        {
          title: "权限二次校验",
          description: "按当前文档权限复核，全部通过",
          time: "18 ms",
        },
        {
          title: "生成有据可依的回答",
          description: `选取 ${sourceCount} 份文档构建回答上下文`,
          time: "820 ms",
        },
      ];
  const scoreRows: Array<{ title: string; percent: number }> = retrieval
    ? retrieval.hits.slice(0, 2).map((hit) => ({
        title: hit.title,
        percent: Math.round(hit.score * 1000) / 10,
      }))
    : (sourceCount === 2
        ? [sourceFor(kind).title, "人力资源管理手册.docx"]
        : [source.title]
      ).map((title, i) => ({
        title,
        percent: i ? 94.2 : 98.6,
      }));
  useEffect(() => {
    setPage(source.page);
    setZoom(100);
  }, [source.title, source.page]);
  const paper = (
    <div
      className="document-paper"
      style={{ fontSize: `${(zoom / 100) * 13}px` }}
    >
      <div className="paper-org">知序科技 · 内部管理文件</div>
      <h3>{source.title.replace(/\.[^.]+$/, "")}</h3>
      <div className="paper-rule" />
      <h4>
        {kind === "leave" || kind === "carry" || kind === "apply"
          ? "第三章　年休假标准"
          : kind === "expense"
            ? "第二章　报销材料与审批"
            : kind === "technical"
              ? "第一章　接口接入与权限"
              : kind === "archive"
                ? "第二章　归档要求"
                : "第二章　入职与休假管理"}
      </h4>
      {page === source.page ? (
        <>
          {sourceIndex === 1 ||
          kind === "onboarding" ||
          kind === "probation" ? (
            <>
              <p>第七条　新员工入职应提交身份、学历、离职证明及银行卡信息。</p>
              <p>
                <mark>
                  累计工作满一年的员工，可依照公司制度享受年休假。入职当年的额度按剩余日历天数折算。
                </mark>
              </p>
              <p>员工应在人事系统中提交申请，并按要求完成工作交接。</p>
            </>
          ) : kind === "expense" ? (
            <>
              <p>第六条　报销应提供以下完整材料：</p>
              <p>
                <mark>费用报销单、合规发票、支付凭证及事前审批记录。</mark>
              </p>
              <p>第七条　经部门负责人审核后，提交财务复核。</p>
            </>
          ) : kind === "archive" ? (
            <>
              <p>
                <mark>
                  项目结项后 5
                  个工作日内，应提交全部最终交付资料，并完成归档审批。
                </mark>
              </p>
              <p>
                归档资料应按项目名称、阶段及文档类型分类，保留完整版本与权限记录。
              </p>
            </>
          ) : kind === "technical" ? (
            <>
              <p>
                <mark>
                  所有检索请求应携带用户身份。检索前执行权限过滤，召回后复核访问权限。
                </mark>
              </p>
              <p>混合召回合并关键词和向量结果，经重排序后构建回答上下文。</p>
            </>
          ) : (
            <>
              <p>
                第十条　<mark>员工可按累计工作年限享受带薪年休假：</mark>
              </p>
              <p className="highlight-lines">
                <mark>（一）满 1 年不满 10 年的，年休假 5 天；</mark>
                <br />
                <mark>（二）满 10 年不满 20 年的，年休假 10 天；</mark>
                <br />
                <mark>（三）满 20 年及以上的，年休假 15 天。</mark>
              </p>
              <p>
                第十一条　年休假按自然年计算，一般应在当年内安排使用。因工作需要确需跨年使用的，须经部门负责人批准。
              </p>
            </>
          )}
        </>
      ) : (
        <>
          <p>本页为文档第 {page} 页的演示预览。</p>
          <p>相关制度适用于企业正式员工，具体事项由对应业务部门解释和执行。</p>
          <p>请返回第 {source.page} 页查看当前回答引用的原文。</p>
          <button className="text-button" onClick={() => setPage(source.page)}>
            返回引用段落 <ArrowUpRight size={13} />
          </button>
        </>
      )}
      <div className="paper-footer">
        <span>内部资料 · 请勿外传</span>
        <span>— {page} —</span>
      </div>
    </div>
  );
  return (
    <aside className="evidence-panel">
      <div className="evidence-tabs" role="tablist" aria-label="证据详情">
        {[
          { id: "source", label: "证据原文" },
          { id: "retrieval", label: "检索过程" },
          { id: "permission", label: "权限校验" },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id as EvidenceTab)}
          >
            {t.label}
          </button>
        ))}
        <IconButton label="收起证据面板" onClick={onClose}>
          <PanelRightClose size={16} />
        </IconButton>
      </div>
      <div className="evidence-content">
        {tab === "source" ? (
          <>
            <div className="evidence-document">
              <FileIcon type={source.type} />
              <div>
                <h3>{source.title}</h3>
                <p>
                  {source.library}
                  <span>·</span>
                  {source.version}
                  <Badge tone="success">已发布</Badge>
                </p>
              </div>
            </div>
            <div className="evidence-match">
              <span>
                <span className="match-dot" />
                已定位到引用段落
              </span>
              <span>相关度 98.6%</span>
            </div>
            <div className="document-viewer">
              <div className="document-toolbar">
                <div>
                  <IconButton
                    label="上一页"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={15} />
                  </IconButton>
                  <span>
                    {page} <span className="muted">/ {source.pages}</span>
                  </span>
                  <IconButton
                    label="下一页"
                    disabled={page >= source.pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={15} />
                  </IconButton>
                </div>
                <div>
                  <IconButton
                    label="缩小"
                    disabled={zoom <= 70}
                    onClick={() => setZoom((z) => z - 10)}
                  >
                    <Minus size={13} />
                  </IconButton>
                  <span>{zoom}%</span>
                  <IconButton
                    label="放大"
                    disabled={zoom >= 150}
                    onClick={() => setZoom((z) => z + 10)}
                  >
                    <Plus size={13} />
                  </IconButton>
                  <IconButton
                    label="全屏查看原文"
                    onClick={() => setExpanded(true)}
                  >
                    <Maximize2 size={14} />
                  </IconButton>
                </div>
              </div>
              <div className="paper-scroll">{paper}</div>
              <div className="viewer-footnote">
                <span className="highlight-key" />
                黄色区域为当前回答的引用内容
              </div>
            </div>
            <section className="document-metadata">
              <button
                className="metadata-heading"
                onClick={() => setMetadata(!metadata)}
              >
                <span>文档信息</span>
                <ChevronDown size={15} className={metadata ? "" : "rotated"} />
              </button>
              {metadata && (
                <dl>
                  <div>
                    <dt>所属知识库</dt>
                    <dd>{source.library}</dd>
                  </div>
                  <div>
                    <dt>文档分类</dt>
                    <dd>企业制度 / {source.category}</dd>
                  </div>
                  <div>
                    <dt>访问权限</dt>
                    <dd>
                      <LockKeyhole size={12} /> 部门可见
                    </dd>
                  </div>
                  <div>
                    <dt>密级</dt>
                    <dd>
                      内部 <span className="tiny-neutral">L2</span>
                    </dd>
                  </div>
                  <div>
                    <dt>当前版本</dt>
                    <dd>
                      {source.version}{" "}
                      <span className="success-text">已发布</span>
                    </dd>
                  </div>
                  <div>
                    <dt>更新时间</dt>
                    <dd>2026-11-02 14:20</dd>
                  </div>
                </dl>
              )}
              <button
                className="version-link"
                onClick={() => setVersions(true)}
              >
                <History size={14} />
                查看版本历史<span>3 个版本</span>
                <ChevronRight size={13} />
              </button>
            </section>
            <div className="evidence-secure">
              <ShieldCheck size={14} />
              仅展示你有权限访问的内容
            </div>
          </>
        ) : tab === "retrieval" ? (
          <>
            <div className="evidence-section-heading">
              <Workflow size={19} />
              <h3>一次回答，完整可追溯</h3>
            </div>
            <p className="evidence-description">本次检索流程的模拟记录</p>
            <div className="retrieval-summary">
              <div>
                <strong>{totalTime}</strong>
                <span>总耗时</span>
              </div>
              <div>
                <strong>{retrieval?.hits.length ?? 12}</strong>
                <span>召回片段</span>
              </div>
              <div>
                <strong>{sourceCount}</strong>
                <span>引用文档</span>
              </div>
            </div>
            <div className="retrieval-timeline">
              {steps.map((s, i) => (
                <div className="retrieval-step" key={s.title}>
                  <span className="step-node">
                    {i === steps.length - 1 ? (
                      <Sparkles size={13} />
                    ) : (
                      <Check size={12} />
                    )}
                  </span>
                  <div>
                    <h4>
                      {s.title}
                      <span>{s.time}</span>
                    </h4>
                    <p>{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="retrieval-score">
              <h4>引用片段相关度</h4>
              {scoreRows.map((row, i) => (
                <div key={i}>
                  <p>
                    <span>{row.title}</span>
                    <strong>{row.percent}%</strong>
                  </p>
                  <div>
                    <i style={{ width: `${row.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="permission-result">
              <span>
                <ShieldCheck size={30} />
              </span>
              <h3>权限校验通过</h3>
              <p>当前身份可访问本次回答中的全部证据</p>
              <Badge tone="success">
                {sourceCount} / {sourceCount} 份文档已授权
              </Badge>
            </div>
            <div className="identity-card">
              <h4>当前访问身份</h4>
              <dl>
                <div>
                  <dt>用户</dt>
                  <dd>张三</dd>
                </div>
                <div>
                  <dt>租户</dt>
                  <dd>知序科技</dd>
                </div>
                <div>
                  <dt>部门 / 角色</dt>
                  <dd>研发部 / 知识管理员</dd>
                </div>
                <div>
                  <dt>可访问密级</dt>
                  <dd>公开 L1、内部 L2</dd>
                </div>
              </dl>
            </div>
            <div className="permission-checks">
              {[
                "租户隔离校验通过",
                "检索前 ACL 范围过滤通过",
                "召回后二次权限校验通过",
                "回答上下文权限校验通过",
              ].map((t) => (
                <div key={t}>
                  <CheckCircle2 size={16} />
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div className="info-callout">
              <Info size={16} />
              <p>
                此面板展示企业权限校验流程。演示使用本地数据，真实权限隔离需在服务端检索链路中实施。
              </p>
            </div>
          </>
        )}
      </div>
      {expanded && (
        <Modal
          title={`${source.title} · 第 ${page} 页`}
          wide
          onClose={() => setExpanded(false)}
        >
          <div className="expanded-paper">{paper}</div>
        </Modal>
      )}
      {versions && (
        <Modal title="文档版本历史" onClose={() => setVersions(false)}>
          <div className="version-timeline">
            {[
              {
                version: source.version,
                date: "2026-11-02",
                text: "更新条款说明，补充审批流程。",
                current: true,
              },
              {
                version: "v2.0",
                date: "2026-08-18",
                text: "统一制度格式，完善部门适用范围。",
              },
              {
                version: "v1.0",
                date: "2026-03-01",
                text: "首次发布，建立基础制度。",
              },
            ].map((v) => (
              <div key={v.version}>
                <span className="version-node" />
                <div>
                  <h4>
                    {v.version}{" "}
                    {v.current && <Badge tone="success">当前版本</Badge>}
                    <small>{v.date}</small>
                  </h4>
                  <p>{v.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="muted">如需编辑或回滚版本，请前往文档中心。</p>
        </Modal>
      )}
    </aside>
  );
}
