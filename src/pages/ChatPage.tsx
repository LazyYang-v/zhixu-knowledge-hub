import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  Info,
  Layers3,
  MessageSquare,
  MoreHorizontal,
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
import { useEffect, useRef, useState } from "react";
import Markdown from "../components/Markdown";
import { RequestStatus } from "../components/RequestStatus";
import { Badge, IconButton, Modal, useToast } from "../components/ui";
import { Toggle } from "../components/ui/Toggle";
import { EvidencePanel } from "../features/chat/components/EvidencePanel";
import { FileIcon } from "../features/chat/components/FileIcon";
import { sendMessageFlow } from "../features/chat/composer";
import { useConversations } from "../features/chat/useConversations";
import { useFeedback } from "../features/chat/useFeedback";
import { useAction } from "../hooks/useAction";
import { apiFetch } from "../lib/api";
import type {
  AnswerKind,
  Conversation,
  RetrievalTrace,
} from "../lib/chat-data";
import { sourceFor } from "../lib/chat-data";
import { getDataMode } from "../lib/data-mode";
import { useLocalStorage } from "../lib/storage";
import "./chat.css";
export { FileIcon } from "../features/chat/components/FileIcon";

type EvidenceTab = "source" | "retrieval" | "permission";
const uid = () => crypto.randomUUID();
const nowTime = () =>
  new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

export default function ChatPage() {
  const {
    conversations,
    setConversations,
    activeId,
    setActiveId,
    loading,
    loadSource,
    error,
    reload,
  } = useConversations();
  const { run, pending } = useAction();
  const [sendError, setSendError] = useState("");
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
  const { feedback, record: recordFeedback } = useFeedback();
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
    if (messages.length > 2)
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages.length, busy]);
  const newConversation = () =>
    void run(async () => {
      const data = await apiFetch<{ conversation: Conversation }>(
        "/api/conversations",
        { method: "POST", body: JSON.stringify({ title: "新会话" }) },
      );
      const created = data?.conversation ?? {
        id: uid(),
        title: "新会话",
        time: nowTime(),
        group: "今天",
        messages: [],
      };
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
      setInput("");
      setEvidenceOpen(false);
      setHistoryVisible(false);
      inputRef.current?.focus();
    });
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
    if (!trimmed || busy || pending) return;
    setBusy(true);
    setSendError("");
    const ensureConversation = async () => {
      const data = await apiFetch<{ conversation: Conversation }>(
        "/api/conversations",
        { method: "POST", body: JSON.stringify({ title: trimmed }) },
      );
      const created = data?.conversation ?? {
        id: uid(),
        title: trimmed,
        time: nowTime(),
        group: "今天",
        messages: [],
      };
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
      return created.id;
    };
    try {
      const result = await sendMessageFlow({
        question: trimmed,
        scope,
        citations,
        multiTurn,
        conversations,
        activeId,
        ensureConversation,
      });
      setConversations((previous) =>
        previous.some((conv) => conv.id === result.conversationId)
          ? previous.map((conv) =>
              conv.id === result.conversationId ? result.conversation : conv,
            )
          : [result.conversation, ...previous],
      );
      setInput("");
      setActiveRetrieval(result.conversation.messages.at(-1)?.retrieval);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "发送失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const deleteConversation = (id: string) =>
    void run(async () => {
      await apiFetch(`/api/conversations/${id}`, { method: "DELETE" });
      setConversations((previous) => previous.filter((conv) => conv.id !== id));
      setSessionMenu(null);
      toast("会话已删除", "success");
    });
  const clearConversations = () =>
    void run(async () => {
      const failed: string[] = [];
      for (const item of conversations) {
        try {
          await apiFetch(`/api/conversations/${item.id}`, { method: "DELETE" });
          setConversations((previous) =>
            previous.filter((conv) => conv.id !== item.id),
          );
        } catch {
          failed.push(item.id);
        }
      }
      if (failed.length)
        throw new Error(
          `${failed.length} 条会话未删除，请重试；已删除的会话不会重复操作`,
        );
      setConfirmClear(false);
      toast("会话历史已删除", "success");
    });
  useEffect(() => {
    const sync = () => {
      try {
        setCitations(
          JSON.parse(localStorage.getItem("knowledge-hub:citations") ?? "true"),
        );
        setMultiTurn(
          JSON.parse(
            localStorage.getItem("knowledge-hub:multi-turn") ?? "true",
          ),
        );
      } catch {}
    };
    window.addEventListener("knowledge-hub:preferences", sync);
    return () => window.removeEventListener("knowledge-hub:preferences", sync);
  }, [setCitations, setMultiTurn]);
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
      {loadSource === "demo" && (
        <div className="offline-badge" role="status">
          离线演示 · 正在使用本地数据
        </div>
      )}
      <aside
        className={`history-panel ${historyVisible ? "history-mobile-open" : ""}`}
      >
        <button
          className="btn btn-primary new-conversation"
          onClick={newConversation}
          disabled={pending || busy}
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
        <RequestStatus loading={loading} error={error} reload={reload} />
        <div className="history-list">
          {["今天", "昨天", "过去 7 天", "更早"].map((group) => {
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
                          disabled={pending}
                          onClick={() => deleteConversation(c.id)}
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
        <div className="capability-note">
          规则问答体验 · LLM、真实引用定位及身份权限尚未接入
        </div>
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
                          {getDataMode() === "server"
                            ? "预置答案 · 未调用模型"
                            : m.kind === "unknown"
                              ? "演示检索完成"
                              : "演示回答"}
                        </span>
                      </div>
                      <Markdown>{m.content}</Markdown>
                      {getDataMode() === "demo" && m.kind === "leave" && (
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
                            <strong>
                              {getDataMode() === "demo"
                                ? "演示引用"
                                : "预置来源（未核验）"}
                            </strong>
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
                                  openEvidence(
                                    m.kind!,
                                    index,
                                    "source",
                                    m.retrieval,
                                  )
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
                              (feedback[m.id] ?? m.feedback?.rating) === "up"
                                ? "feedback-active"
                                : ""
                            }
                            onClick={() => {
                              void run(async () => {
                                await recordFeedback(
                                  conversation?.id,
                                  m.id,
                                  "up",
                                  m.feedback?.rating,
                                );
                                toast("反馈已保存", "success");
                              });
                            }}
                          >
                            <ThumbsUp size={15} />
                          </IconButton>
                          <IconButton
                            label="回答无帮助"
                            className={
                              (feedback[m.id] ?? m.feedback?.rating) === "down"
                                ? "feedback-active"
                                : ""
                            }
                            onClick={() => {
                              void run(async () => {
                                await recordFeedback(
                                  conversation?.id,
                                  m.id,
                                  "down",
                                  m.feedback?.rating,
                                );
                                toast("反馈已保存", "success");
                              });
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
                          {getDataMode() === "server"
                            ? "阶段耗时未测量"
                            : "演示耗时"}
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
          {sendError && (
            <div className="inline-error" role="alert">
              {sendError}
              <button className="text-button" onClick={() => void send()}>
                重试发送
              </button>
            </div>
          )}
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
            当前为规则演示答案；引用与权限尚未核验<span>规则检索</span>
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
            {getDataMode() === "server"
              ? "将删除服务端当前列表中的"
              : "将删除本地演示中的"}{" "}
            {conversations.length}{" "}
            条会话及消息。删除无法撤销；发生部分失败时可重试。
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
              disabled={pending}
              onClick={clearConversations}
            >
              {pending ? "正在删除…" : "确认删除会话"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
