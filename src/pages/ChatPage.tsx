import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  Info,
  Layers3,
  LockKeyhole,
  Maximize2,
  MessageSquare,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { Badge, IconButton, Modal, useToast } from "../components/ui";
import Markdown from "../components/Markdown";
import { apiFetch } from "../lib/api";
import {
  answers,
  identifyAnswer,
  initialConversations,
  sourceFor,
} from "../lib/chat-data";
import type {
  AnswerKind,
  Citation,
  Conversation,
  Message,
  RetrievalTrace,
} from "../lib/chat-data";
import { useLocalStorage } from "../lib/storage";
import "./chat.css";

type EvidenceTab = "source" | "retrieval" | "permission";
const uid = () => crypto.randomUUID();
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      className="toggle-label"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span>{label}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}
export function FileIcon({ type = "pdf" }: { type?: string }) {
  return (
    <span className={`file-icon file-icon-${type}`}>
      <FileText size={19} />
      <small>{type === "docx" ? "W" : type === "md" ? "MD" : "PDF"}</small>
    </span>
  );
}

function EvidencePanel({
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
  const totalTime = retrieval
    ? ((stageTime / 1000).toFixed(1) + " s")
    : "1.2 s";
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
                <strong>
                  {totalTime}
                </strong>
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

export default function ChatPage() {
  const [conversations, setConversations] = useLocalStorage<Conversation[]>(
    "conversations-v1",
    initialConversations,
  );
  const [activeId, setActiveId] = useLocalStorage(
    "active-conversation-v1",
    "annual-leave",
  );
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("全部知识库");
  const [citations, setCitations] = useLocalStorage("citations", true);
  const [multiTurn, setMultiTurn] = useLocalStorage("multi-turn", true);
  const [evidenceOpen, setEvidenceOpen] = useState(
    () => window.innerWidth > 1150,
  );
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>("source");
  const [selectedKind, setSelectedKind] = useState<AnswerKind>("leave");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [activeRetrieval, setActiveRetrieval] = useState<
    RetrievalTrace | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sessionMenu, setSessionMenu] = useState<string | null>(null);
  const [suggestionSet, setSuggestionSet] = useState(0);
  const [feedback, setFeedback] = useLocalStorage<Record<string, string>>(
    "answer-feedback",
    {},
  );
  const [attachment, setAttachment] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversation = conversations.find((c) => c.id === activeId);
  const messages = conversation?.messages || [];
  const lastAnswerKind = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.kind;
  useEffect(() => {
    if (lastAnswerKind && lastAnswerKind !== "unknown") {
      setSelectedKind(lastAnswerKind);
      setSourceIndex(0);
    } else setEvidenceOpen(false);
  }, [activeId, lastAnswerKind]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEvidenceOpen(false);
        setHistoryVisible(false);
        setSessionMenu(null);
      }
    };
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    apiFetch<{ conversations: Conversation[] }>("/api/conversations").then(
      (data) => {
        if (data?.conversations.length) {
          setConversations(data.conversations);
          setActiveId(data.conversations[0].id);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (messages.length > 2)
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages.length, busy]);
  const newConversation = async () => {
    const data = await apiFetch<{ conversation: Conversation }>(
      "/api/conversations",
      { method: "POST", body: JSON.stringify({ title: "新会话" }) },
    );
    if (data) {
      setConversations((prev) => [data.conversation, ...prev]);
      setActiveId(data.conversation.id);
    } else {
      const id = uid();
      setConversations((prev) => [
        {
          id,
          title: "新会话",
          time: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          group: "今天",
          messages: [],
        },
        ...prev,
      ]);
      setActiveId(id);
    }
    setInput("");
    setEvidenceOpen(false);
    setHistoryVisible(false);
    inputRef.current?.focus();
  };
  const selectConversation = (c: Conversation) => {
    setActiveId(c.id);
    setHistoryVisible(false);
    const m = [...c.messages]
      .reverse()
      .find((m) => m.kind && m.kind !== "unknown");
    if (m?.kind) {
      setSelectedKind(m.kind);
      setSourceIndex(0);
    }
    setSessionMenu(null);
  };
  const send = async (question = input) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setInput("");
    setBusy(true);
    const startedAt = Date.now();
    const previous = [...messages].reverse().find((m) => m.kind)?.kind;
    try {
      let conversationId = activeId;
      if (!conversation) {
        const created = await apiFetch<{ conversation: Conversation }>(
          "/api/conversations",
          { method: "POST", body: JSON.stringify({ title: trimmed }) },
        );
        if (!created) throw new Error("offline");
        conversationId = created.conversation.id;
        setConversations((prev) => [created.conversation, ...prev]);
        setActiveId(conversationId);
      }
      const data = await apiFetch<{
        userMessage: Message;
        answerMessage: Message;
        conversation: Conversation;
      }>(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: trimmed,
          scope,
          citations,
          multiTurn,
        }),
      });
      if (!data) throw new Error("offline");
      const elapsed = Date.now() - startedAt;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 650 - elapsed)),
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversation.id ? data.conversation : c,
        ),
      );
      if (data.answerMessage.kind && data.answerMessage.kind !== "unknown") {
        setSelectedKind(data.answerMessage.kind);
        setSourceIndex(0);
        setActiveRetrieval(data.answerMessage.retrieval);
      }
      setBusy(false);
    } catch {
      const kind = identifyAnswer(
        trimmed,
        scope,
        multiTurn ? previous : undefined,
      );
      const fallbackId = conversation ? activeId : uid();
      const user: Message = { id: uid(), role: "user", content: trimmed };
      if (!conversation) {
        setConversations((prev) => [
          {
            id: fallbackId,
            title: trimmed,
            time: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            group: "今天",
            messages: [user],
          },
          ...prev,
        ]);
        setActiveId(fallbackId);
      } else {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === fallbackId
              ? {
                  ...c,
                  title: c.messages.length ? c.title : trimmed,
                  messages: [...c.messages, user],
                }
              : c,
          ),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 850));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === fallbackId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: uid(),
                    role: "assistant",
                    content: answers[kind],
                    kind,
                    citations,
                  },
                ],
              }
            : c,
        ),
      );
      setBusy(false);
    }
  };
  const openEvidence = (
    kind: AnswerKind,
    index = 0,
    tab: EvidenceTab = "source",
    trace?: RetrievalTrace,
  ) => {
    setSelectedKind(kind);
    setSourceIndex(index);
    setEvidenceTab(tab);
    setActiveRetrieval(trace);
    setEvidenceOpen(true);
  };
  const suggestions =
    suggestionSet % 2 === 0
      ? ["年假可以跨年使用吗？", "试用期可以享受年假吗？", "年假如何申请？"]
      : ["报销需要哪些材料？", "新人入职需要准备什么？", "项目文档如何归档？"];
  return (
    <div className={`chat-workspace ${evidenceOpen ? "" : "evidence-hidden"}`}>
      <aside
        className={`history-panel ${historyVisible ? "history-mobile-open" : ""}`}
      >
        <button
          className="btn btn-primary new-conversation"
          onClick={newConversation}
        >
          <Plus size={18} />
          新建会话
        </button>
        <div className="history-heading">
          <span>会话历史</span>
          <div>
            <IconButton
              label="搜索会话"
              onClick={() => setShowHistorySearch(!showHistorySearch)}
            >
              <Search size={14} />
            </IconButton>
            <IconButton
              label="关闭会话列表"
              className="history-close"
              onClick={() => setHistoryVisible(false)}
            >
              <X size={15} />
            </IconButton>
          </div>
        </div>
        {showHistorySearch && (
          <input
            className="history-search input"
            placeholder="搜索历史会话…"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
        )}
        <div className="history-list">
          {["今天", "昨天", "过去 7 天"].map((group) => {
            const filtered = conversations.filter(
              (c) => c.group === group && c.title.includes(historySearch),
            );
            return filtered.length ? (
              <div key={group}>
                <div className="history-group">{group}</div>
                {filtered.map((c) => (
                  <div
                    key={c.id}
                    className={`conversation-item ${c.id === activeId ? "active" : ""}`}
                  >
                    <button
                      className="conversation-select"
                      onClick={() => selectConversation(c)}
                    >
                      <MessageSquare size={16} />
                      <span>
                        <strong>{c.title}</strong>
                        <small>
                          {c.time}
                          {c.id === activeId && <span>当前会话</span>}
                        </small>
                      </span>
                    </button>
                    <IconButton
                      label={`管理会话：${c.title}`}
                      className="conversation-more"
                      onClick={() =>
                        setSessionMenu(sessionMenu === c.id ? null : c.id)
                      }
                    >
                      <MoreHorizontal size={15} />
                    </IconButton>
                    {sessionMenu === c.id && (
                      <div className="session-menu">
                        <button
                          onClick={() => {
                            apiFetch(`/api/conversations/${c.id}`, {
                              method: "DELETE",
                            });
                            setConversations((prev) =>
                              prev.filter((x) => x.id !== c.id),
                            );
                            if (c.id === activeId) setActiveId("");
                            setSessionMenu(null);
                            toast("会话已删除");
                          }}
                        >
                          <Trash2 size={14} />
                          删除会话
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null;
          })}
          {!conversations.length && (
            <div className="history-empty">
              <MessageSquare size={24} />
              <p>还没有会话记录</p>
              <small>从一个好问题开始</small>
            </div>
          )}
        </div>
        <div className="history-bottom">
          <div className="history-tip">
            <span>
              <Sparkles size={16} />
            </span>
            <p>
              企业知识，触手可及<small>每一次提问，都让知识更有价值。</small>
            </p>
          </div>
          <button
            className="clear-history"
            disabled={!conversations.length}
            onClick={() => setConfirmClear(true)}
          >
            <Trash2 size={14} />
            清空历史记录
          </button>
        </div>
      </aside>
      <section className="conversation-panel">
        <div className="chat-toolbar">
          <button
            className="mobile-history-button icon-button"
            aria-label="打开会话列表"
            onClick={() => setHistoryVisible(true)}
          >
            <History size={18} />
          </button>
          <div className="scope-control">
            <span>知识范围</span>
            <div>
              <Layers3 size={15} />
              <select
                aria-label="知识范围"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                {["全部知识库", "企业制度", "技术文档", "项目资料", "FAQ"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </div>
          </div>
          <div className="chat-options">
            <Toggle
              label="引用溯源"
              checked={citations}
              onChange={() => setCitations(!citations)}
            />
            <Toggle
              label="多轮会话"
              checked={multiTurn}
              onChange={() => setMultiTurn(!multiTurn)}
            />
            {!evidenceOpen &&
              lastAnswerKind &&
              lastAnswerKind !== "unknown" && (
                <IconButton
                  label="打开证据面板"
                  onClick={() => setEvidenceOpen(true)}
                >
                  <PanelRightOpen size={17} />
                </IconButton>
              )}
          </div>
        </div>
        <div className="chat-scroll" ref={scrollRef}>
          {messages.length ? (
            <>
              <div className="chat-date">
                <span />
                {conversation?.group} · {conversation?.time}
                <span />
              </div>
              {messages.map((m) =>
                m.role === "user" ? (
                  <div className="user-message" key={m.id}>
                    <div>{m.content}</div>
                    <span className="avatar avatar-user small">张</span>
                  </div>
                ) : (
                  <div className="assistant-message" key={m.id}>
                    <div className="assistant-avatar">
                      <Bot size={21} />
                    </div>
                    <div className="assistant-body">
                      <div className="assistant-meta">
                        <strong>知序助手</strong>
                        <span>
                          <CheckCircle2 size={11} />
                          {m.kind === "unknown" ? "检索完成" : "已完成知识检索"}
                        </span>
                      </div>
                      <Markdown>{m.content}</Markdown>
                      {m.kind === "leave" && (
                        <div className="answer-callout">
                          <Info size={16} />
                          <div>
                            <strong>补充说明</strong>
                            <ul>
                              <li>
                                年休假按自然年计算，一般应在当年内安排使用。
                              </li>
                              <li>
                                因工作需要确需跨年使用的，须经部门负责人批准。
                              </li>
                              <li>
                                具体执行细则以《员工休假管理制度》最新版本为准。
                              </li>
                            </ul>
                          </div>
                        </div>
                      )}
                      {m.citations && m.kind && m.kind !== "unknown" && (
                        <div className="citation-card">
                          <div className="citation-heading">
                            <BookOpen size={15} />
                            <strong>引用来源</strong>
                            <span>
                              {m.sources
                                ? m.sources.length
                                : ["leave", "carry", "apply"].includes(m.kind)
                                  ? 2
                                  : 1}
                            </span>
                            <small>点击查看原文</small>
                          </div>
                          {(m.sources && m.sources.length
                            ? m.sources
                            : (["leave", "carry", "apply"].includes(m.kind)
                                ? [0, 1]
                                : [0]
                              ).map((index) => sourceFor(m.kind, index === 1))
                          ).map((s, index) => {
                            return (
                              <button
                                className={`citation-row ${selectedKind === m.kind && sourceIndex === index && evidenceOpen ? "selected" : ""}`}
                                key={index}
                                onClick={() =>
                                  openEvidence(m.kind!, index, "source", m.retrieval)
                                }
                              >
                                <FileIcon type={s.type} />
                                <span className="citation-name">
                                  <b>[{index + 1}]</b>
                                  {s.title}
                                </span>
                                <span className="citation-page">
                                  第 {s.page}
                                  {s.pages > s.page && index ? "–8" : ""} 页
                                </span>
                                <span className="citation-version">
                                  {s.version}
                                </span>
                                <Badge tone="success">已发布</Badge>
                                <ChevronRight size={15} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="answer-actions">
                        <div>
                          <IconButton
                            label="回答有帮助"
                            className={
                              feedback[m.id] === "up" ? "feedback-active" : ""
                            }
                            onClick={() => {
                              const rating = feedback[m.id] === "up" ? "" : "up";
                              if (rating)
                                apiFetch(
                                  `/api/conversations/${conversation?.id}/messages/${m.id}/feedback`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({ rating: "up" }),
                                  },
                                );
                              setFeedback((prev) => ({
                                ...prev,
                                [m.id]: rating,
                              }));
                              toast("感谢反馈，已在本地记录");
                            }}
                          >
                            <ThumbsUp size={15} />
                          </IconButton>
                          <IconButton
                            label="回答无帮助"
                            className={
                              feedback[m.id] === "down" ? "feedback-active" : ""
                            }
                            onClick={() => {
                              const rating =
                                feedback[m.id] === "down" ? "" : "down";
                              if (rating)
                                apiFetch(
                                  `/api/conversations/${conversation?.id}/messages/${m.id}/feedback`,
                                  {
                                    method: "PATCH",
                                    body: JSON.stringify({ rating: "down" }),
                                  },
                                );
                              setFeedback((prev) => ({
                                ...prev,
                                [m.id]: rating,
                              }));
                              toast("已记录反馈，我们会持续改进回答");
                            }}
                          >
                            <ThumbsDown size={15} />
                          </IconButton>
                          <IconButton
                            label="复制回答"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(m.content)
                                .then(() => toast("回答已复制"))
                                .catch(() =>
                                  toast("浏览器不支持复制，请手动选择文本"),
                                )
                            }
                          >
                            <Copy size={15} />
                          </IconButton>
                          <span className="action-divider" />
                          {m.kind !== "unknown" && (
                            <button
                              className="retrieval-link"
                              onClick={() =>
                                openEvidence(
                                  m.kind || "leave",
                                  0,
                                  "retrieval",
                                  m.retrieval,
                                )
                              }
                            >
                              <Workflow size={13} />
                              检索过程
                            </button>
                          )}
                        </div>
                        <span className="answer-timing">
                          <Clock3 size={11} />
                          {m.retrieval
                            ? `${(m.retrieval.stages.reduce((s, st) => s + st.ms, 0) / 1000).toFixed(1)} s`
                            : "1.2 s"}
                          <span>·</span>
                          {m.retrieval
                            ? m.retrieval.hits.length
                            : m.kind === "unknown"
                              ? 0
                              : 12}{" "}
                          条检索
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              )}
              {busy && (
                <div className="assistant-message">
                  <div className="assistant-avatar">
                    <Bot size={21} />
                  </div>
                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                    <small>正在查找相关知识…</small>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="chat-welcome">
              <span className="welcome-bot">
                <Layers3 size={38} />
                <span>
                  <Sparkles size={14} />
                </span>
              </span>
              <span className="welcome-eyebrow">你的企业知识伙伴</span>
              <h2>你好，今天想了解什么？</h2>
              <p>
                从企业制度到项目经验，
                <br />
                在这里找到有据可依的答案。
              </p>
              <div className="welcome-questions">
                {[
                  "公司的员工年假制度是什么？",
                  "报销流程和所需材料？",
                  "如何接入研发 API？",
                ].map((q) => (
                  <button key={q} onClick={() => send(q)}>
                    <MessageSquare size={16} />
                    {q}
                    <ArrowUpRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="composer-section">
          {messages.length > 0 && (
            <div className="suggestion-section">
              <div>
                <span>
                  <Sparkles size={14} />
                  你可能还想了解
                </span>
                <button onClick={() => setSuggestionSet((s) => s + 1)}>
                  <RefreshCw size={12} />
                  换一批
                </button>
              </div>
              <div className="suggestion-list">
                {suggestions.map((q) => (
                  <button disabled={busy} key={q} onClick={() => send(q)}>
                    {q}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            {attachment && (
              <div className="attachment-chip">
                <FileText size={12} />
                {attachment}
                <small>仅本地附件</small>
                <button
                  type="button"
                  aria-label="移除附件"
                  onClick={() => setAttachment("")}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              aria-label="向知识助手提问"
              placeholder="向知识提问，让答案有迹可循…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
            />
            <div className="composer-bottom">
              <div>
                <IconButton
                  label="添加本地参考附件"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={17} />
                </IconButton>
                <span className="composer-scope">
                  <Layers3 size={12} />
                  {scope}
                </span>
                <input
                  type="file"
                  hidden
                  ref={fileRef}
                  accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setAttachment(f.name);
                      toast("附件已添加到本地演示；内容不会上传或参与回答");
                    }
                    e.target.value = "";
                  }}
                />
              </div>
              <span className="enter-hint">Enter 发送，Shift + Enter 换行</span>
              <button
                className="send-button"
                type="submit"
                disabled={!input.trim() || busy}
                aria-label="发送问题"
              >
                {busy ? (
                  <span className="button-spinner" />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            </div>
          </form>
          <div className="composer-note">
            <ShieldCheck size={11} />
            回答由后端知识服务生成，请结合原文核实<span>服务端检索</span>
          </div>
        </div>
      </section>
      {evidenceOpen && (
        <div
          className="evidence-scrim"
          onClick={() => setEvidenceOpen(false)}
          aria-hidden="true"
        />
      )}
      {evidenceOpen && (
        <EvidencePanel
          kind={selectedKind}
          sourceIndex={sourceIndex}
          tab={evidenceTab}
          setTab={setEvidenceTab}
          onClose={() => setEvidenceOpen(false)}
          retrieval={activeRetrieval}
        />
      )}
      {confirmClear && (
        <Modal title="清空会话历史" onClose={() => setConfirmClear(false)}>
          <p>
            将清空此浏览器中保存的全部 {conversations.length}{" "}
            条会话记录。知识库和文档不受影响。
          </p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setConfirmClear(false)}
            >
              取消
            </button>
            <button
              className="btn btn-danger"
              onClick={() => {
                conversations.forEach((c) =>
                  apiFetch(`/api/conversations/${c.id}`, { method: "DELETE" }),
                );
                setConversations([]);
                setActiveId("");
                setConfirmClear(false);
                toast("会话历史已清空");
              }}
            >
              确认清空
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
