import { Button } from "../components/ui/Button";
import {
  ArrowRight,
  FileText,
  GitBranch,
  History,
  Layers3,
  LockKeyhole,
  Pencil,
  Search,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";
import { RequestStatus } from "../components/RequestStatus";
import {
  Badge,
  IconButton,
  Modal,
  PageHeader,
  useToast,
} from "../components/ui";
import { DocumentList } from "../features/knowledge/components/DocumentList";
import { statusTone } from "../features/knowledge/presenters";
import type {
  KnowledgeDocument,
  KnowledgeVersion,
} from "../features/knowledge/types";
import { useKnowledgeDocuments } from "../features/knowledge/useKnowledge";
import { useKnowledgeBases } from "../features/knowledge/useKnowledgeBases";
import { useAction } from "../hooks/useAction";
import "./knowledge.css";
import { UploadModal } from "./UploadModal";
import { downloadOriginal } from "../lib/upload";
import { getDataMode } from "../lib/data-mode";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { useAuthorization } from "../hooks/useAuthorization";
type PageProps = { onNavigate?: (page: string) => void };
type Version = KnowledgeVersion;
const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
const today = () => new Date().toLocaleDateString("sv-SE");

export function DocumentsPage({ onNavigate }: PageProps) {
  const {
    docs,
    setDocs,
    saveChunk,
    rollback,
    changeStatus,
    loading,
    error,
    reload,
  } = useKnowledgeDocuments();
  const { run, pending } = useAction();
  const { bases } = useKnowledgeBases();
  const { secured, can, canBase } = useAuthorization();
  const writableBases = bases.filter((base) => canBase(base.id, "write"));
  const toast = useToast();
  const [query, setQuery] = useState(() => {
    const query = sessionStorage.getItem("knowledge-hub:document-query") ?? "";
    sessionStorage.removeItem("knowledge-hub:document-query");
    return query;
  });
  const [status, setStatus] = useState("全部");
  const [category, setCategory] = useState(() => {
    const stored = sessionStorage.getItem("knowledge-hub:category");
    sessionStorage.removeItem("knowledge-hub:category");
    return stored || "全部知识库";
  });
  const [upload, setUpload] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("内容分块");
  const [editorRevision, setEditorRevision] = useState<number | undefined>();
  const [editedChunks, setEditedChunks] = useState<string[]>([]);
  const [editorBaseline, setEditorBaseline] = useState<string[]>([]);
  const [editingChunk, setEditingChunk] = useState<number | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const doc = docs.find((d) => d.id === selected);
  const dirty =
    !!doc &&
    (editedChunks.length !== editorBaseline.length ||
      editedChunks.some((chunk, index) => chunk !== editorBaseline[index]));
  const conflict =
    !!doc && editorRevision !== undefined && editorRevision !== doc.revision;
  useUnsavedChanges(dirty);
  const discardDraft = () =>
    !dirty || window.confirm("放弃尚未保存的分块修改？");
  const reloadEditor = () => {
    if (!doc || pending || !discardDraft()) return;
    setEditedChunks([...doc.chunks]);
    setEditorBaseline([...doc.chunks]);
    setEditorRevision(doc.revision);
    setEditingChunk(null);
  };
  const filtered = docs.filter(
    (d) =>
      (!query ||
        (d.name + d.owner).toLowerCase().includes(query.toLowerCase())) &&
      (status === "全部" || d.status === status) &&
      (category === "全部知识库" || d.category === category),
  );
  const openDoc = (item: KnowledgeDocument) => {
    setSelected(item.id);
    setEditedChunks([...item.chunks]);
    setEditorBaseline([...item.chunks]);
    setEditorRevision(item.revision);
    setTab("内容分块");
    setEditingChunk(null);
    setDiff(null);
  };
  const updateStatus = (item: KnowledgeDocument) =>
    void run(async () => {
      await changeStatus(item);
      toast(`文档${item.status === "已发布" ? "已归档" : "已发布"}`, "success");
    });
  const saveChunkLocal = () =>
    void run(async () => {
      if (!doc) return;
      if (editedChunks.some((chunk) => !chunk.trim()))
        throw new Error("分块内容不能为空");
      const saved = await saveChunk(doc.id, editedChunks, editorRevision);
      setEditedChunks([...saved.chunks]);
      setEditorBaseline([...saved.chunks]);
      setEditorRevision(saved.revision);
      setEditingChunk(null);
      toast(
        `已保存为 ${saved.versions[0]?.version}；真实重索引尚未接入`,
        "success",
      );
    });
  const handleRollback = (version: Version) =>
    void run(async () => {
      if (!doc) return;
      if (!discardDraft()) return;
      const saved = await rollback(doc.id, version);
      setEditedChunks([...saved.chunks]);
      setEditorBaseline([...saved.chunks]);
      setEditorRevision(saved.revision);
      setDiff(null);
      toast(`已恢复 ${version.version} 内容，保留历史版本`, "success");
    });
  return (
    <div className="page-content kp-page">
      <PageHeader
        title="文档中心"
        description="让知识从文档走向答案，统一管理每一份可信内容。"
        action={
          <div className="header-actions">
            <Button variant="secondary" onClick={reload}>
              刷新
            </Button>
            <button
              className="btn btn-primary"
              disabled={
                !can("upload") || (secured && writableBases.length === 0)
              }
              onClick={() => setUpload(true)}
            >
              <UploadCloud size={17} />
              上传文档
            </button>
          </div>
        }
      />
      <RequestStatus loading={loading} error={error} reload={reload} />
      <div className="kp-document-banner">
        <div className="kp-banner-copy">
          <span className="kp-banner-mark">
            <FileText size={24} />
          </span>
          <div>
            <h3>一处沉淀，多处受益</h3>
            <p>支持 PDF、Word、PPT、Excel、Markdown、网页与图片</p>
          </div>
        </div>
        <div className="kp-banner-stats">
          <strong>
            {docs.length}
            <small>全部文档</small>
          </strong>
          <i />
          <strong>
            {docs.filter((d) => d.status === "已发布").length}
            <small>已发布</small>
          </strong>
          <i />
          <strong>
            {docs.filter((d) => d.task === "running").length}
            <small>处理中</small>
          </strong>
        </div>
      </div>
      <div className="panel kp-doc-panel">
        <div className="kp-doc-tabs">
          {["全部", "已发布", "草稿", "已归档"].map((s) => (
            <button
              key={s}
              className={`kp-doc-tab ${status === s ? "active" : ""}`}
              onClick={() => setStatus(s)}
            >
              {s}
              <span>
                {s === "全部"
                  ? docs.length
                  : docs.filter((d) => d.status === s).length}
              </span>
            </button>
          ))}
        </div>
        <div className="kp-table-controls">
          <div className="kp-search">
            <Search size={17} />
            <input
              aria-label="搜索文档"
              placeholder="搜索文档名称、创建人…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="按知识库筛选"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>全部知识库</option>
            {Array.from(
              new Set([
                ...bases.map((b) => b.name),
                ...docs.map((d) => d.category),
              ]),
            ).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <span className="kp-record-count">共 {filtered.length} 份文档</span>
        </div>
        <DocumentList
          documents={filtered}
          loading={loading}
          pending={pending}
          onOpen={openDoc}
          onStatus={updateStatus}
        />
        <div className="kp-table-footer">
          <span>
            <ShieldCheck size={14} />
            仅保存权限元数据，访问隔离尚未接入
          </span>
          <span>
            展示 {filtered.length} / {docs.length} 条
          </span>
        </div>
      </div>
      <p className="kp-demo-note">
        原文件保存在服务端；UTF-8 TXT/Markdown
        与粘贴文本可后台切分。其他格式解析、网页抓取与向量化尚未接入。
        {secured
          ? "当前已按账户及知识库授权限制访问。"
          : "当前未接入真实身份授权。"}
      </p>
      {upload && (
        <UploadModal
          categories={writableBases.map((b) => b.name)}
          onClose={() => setUpload(false)}
          onAdd={(items) => {
            setDocs((current) => [
              ...items,
              ...current.filter(
                (item) => !items.some((added) => added.id === item.id),
              ),
            ]);
            setUpload(false);
            setCategory("全部知识库");
            setStatus("全部");
            setQuery("");
            toast(
              `已保存 ${items.length} 份文档；文本后台切分，其他格式可在任务页查看待接入原因`,
              "success",
            );
          }}
        />
      )}
      {doc && (
        <Modal
          wide
          title={doc.name}
          onClose={() => {
            if (!pending && discardDraft()) setSelected(null);
          }}
        >
          <div className="kp-preview-meta">
            <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
            <span>{doc.category}</span>
            <span>{doc.versions[0].version}</span>
            <span>{doc.chunks.length} 个分块</span>
            {doc.sourceArtifactId && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  void run(() => downloadOriginal(doc.sourceArtifactId!))
                }
              >
                {pending ? "正在处理…" : "下载原文件"}
              </button>
            )}
          </div>
          {conflict && (
            <div className="kp-inline-info" role="status">
              文档已更新，已保留当前编辑内容。请比较后重新载入最新版本。
            </div>
          )}
          <div className="kp-modal-actions">
            <button
              className="btn btn-secondary"
              disabled={pending}
              onClick={reload}
            >
              检查最新版本
            </button>
            <button
              className="btn btn-secondary"
              disabled={pending}
              onClick={reloadEditor}
            >
              重新载入最新分块
            </button>
            {dirty && <span>有未保存的修改</span>}
          </div>
          <div className="kp-preview-tabs">
            {["内容分块", "权限元数据", "版本历史"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t === "内容分块" ? (
                  <Layers3 size={15} />
                ) : t === "权限元数据" ? (
                  <ShieldCheck size={15} />
                ) : (
                  <History size={15} />
                )}
                {t}
              </button>
            ))}
          </div>
          {tab === "内容分块" && (
            <div className="kp-chunks">
              <div className="kp-chunk-heading">
                <span>分块策略：{doc.strategy}</span>
                <Badge tone="purple">
                  {getDataMode() === "demo"
                    ? doc.task === "running"
                      ? stages[doc.stage] + "（模拟）"
                      : "索引就绪（模拟）"
                    : doc.task === "running"
                      ? "文本准备中"
                      : doc.task === "error"
                        ? "处理未完成 · 查看任务"
                        : "文本可用 · 向量索引未接入"}
                </Badge>
              </div>
              {editedChunks.map((chunk, i) => (
                <div
                  className="kp-chunk"
                  key={`${selected}-${editorRevision}-${i}`}
                >
                  <div className="kp-chunk-top">
                    <span>
                      <Layers3 size={14} />
                      CHUNK {String(i + 1).padStart(3, "0")}
                    </span>
                    <span>
                      {chunk.length} 字符
                      <IconButton
                        label={`编辑第${i + 1}个分块`}
                        disabled={pending || !canBase(doc.baseId, "write")}
                        onClick={() => {
                          setEditingChunk(i);
                        }}
                      >
                        <Pencil size={14} />
                      </IconButton>
                    </span>
                  </div>
                  {editingChunk === i ? (
                    <>
                      <textarea
                        className="input"
                        aria-label={`第${i + 1}个分块内容`}
                        disabled={pending}
                        rows={5}
                        value={editedChunks[i]}
                        onChange={(e) =>
                          setEditedChunks((current) =>
                            current.map((c, n) =>
                              n === i ? e.target.value : c,
                            ),
                          )
                        }
                      />
                      <div className="kp-modal-actions">
                        <button
                          className="btn btn-secondary"
                          disabled={pending}
                          onClick={() => {
                            if (discardDraft()) {
                              setEditedChunks([...doc.chunks]);
                              setEditorBaseline([...doc.chunks]);
                              setEditorRevision(doc.revision);
                              setEditingChunk(null);
                            }
                          }}
                        >
                          取消
                        </button>
                        <button
                          className="btn btn-primary"
                          disabled={pending || conflict}
                          onClick={saveChunkLocal}
                        >
                          保存分块
                        </button>
                      </div>
                    </>
                  ) : (
                    <p>{chunk}</p>
                  )}
                  <div className="kp-chunk-acl">
                    <LockKeyhole size={12} />
                    企业租户 · {doc.department} · {doc.level}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "权限元数据" && (
            <div className="kp-acl-content">
              <div className="kp-acl-callout">
                <ShieldCheck size={23} />
                <div>
                  <strong>权限随知识入库</strong>
                  <p>
                    以下是文档记录中的元数据；当前检索尚未使用这些字段执行访问隔离。
                  </p>
                </div>
              </div>
              <dl className="kp-definition-list">
                <div>
                  <dt>租户</dt>
                  <dd>enterprise-demo</dd>
                </div>
                <div>
                  <dt>部门范围</dt>
                  <dd>{doc.department}</dd>
                </div>
                <div>
                  <dt>访问角色</dt>
                  <dd>成员、知识管理员</dd>
                </div>
                <div>
                  <dt>密级</dt>
                  <dd>{doc.level}</dd>
                </div>
                <div>
                  <dt>文档状态</dt>
                  <dd>{doc.status}</dd>
                </div>
                <div>
                  <dt>查询资格</dt>
                  <dd>
                    {doc.status === "已发布" && doc.task === "done"
                      ? "可用于规则检索；后端权限隔离尚未实现"
                      : "未发布 / 归档文档不参与检索"}
                  </dd>
                </div>
              </dl>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (pending) return;
                  if (onNavigate) onNavigate("permissions");
                  else if (discardDraft()) setSelected(null);
                }}
              >
                管理组织与权限
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {tab === "版本历史" && (
            <div className="kp-version-list">
              {doc.versions.map((version, i) => (
                <div className="kp-version" key={version.version}>
                  <span className={`kp-version-dot ${i === 0 ? "active" : ""}`}>
                    <GitBranch size={16} />
                  </span>
                  <div className="kp-version-detail">
                    <div>
                      <strong>{version.version}</strong>
                      {i === 0 && <Badge tone="purple">当前版本</Badge>}
                      <time>{version.date}</time>
                    </div>
                    <p>{version.note}</p>
                    <div className="kp-version-actions">
                      <button
                        className="kp-text-button"
                        onClick={() =>
                          setDiff(
                            diff === version.version ? null : version.version,
                          )
                        }
                      >
                        {diff === version.version
                          ? "收起内容"
                          : i === 0
                            ? "查看内容"
                            : "对比当前版本"}
                      </button>
                      {i > 0 && (
                        <button
                          className="kp-text-button"
                          disabled={pending}
                          onClick={() => handleRollback(version)}
                        >
                          <History size={13} />
                          恢复此版本
                        </button>
                      )}
                    </div>
                    {diff === version.version && (
                      <div className="kp-diff">
                        <div>
                          <span>{version.version}</span>
                          {version.chunks.map((chunk, n) => (
                            <p
                              key={n}
                              className={
                                chunk !== doc.chunks[n] ? "kp-diff-old" : ""
                              }
                            >
                              {chunk}
                            </p>
                          ))}
                        </div>
                        {i > 0 && (
                          <div>
                            <span>当前 {doc.versions[0].version}</span>
                            {doc.chunks.map((chunk, n) => (
                              <p
                                key={n}
                                className={
                                  chunk !== version.chunks[n]
                                    ? "kp-diff-new"
                                    : ""
                                }
                              >
                                {chunk}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
