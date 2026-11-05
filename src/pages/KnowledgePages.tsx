import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  File,
  FileText,
  FolderKanban,
  GitBranch,
  Globe,
  History,
  Layers3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  StatCard,
  useToast,
} from "../components/ui";
import { apiFetch } from "../lib/api";
import { useLocalStorage } from "../lib/storage";
import { seedDocuments, seedBases } from "../features/knowledge/seed";
import { useKnowledgeBases } from "../features/knowledge/useKnowledgeBases";
import { useKnowledgeDocuments } from "../features/knowledge/useKnowledge";
import { useTasks } from "../features/tasks/useTasks";
import { versionNext } from "../features/knowledge/useKnowledge";
import type { KnowledgeBase, KnowledgeDocument, KnowledgeVersion } from "../features/knowledge/types";
import { DocIcon, statusTone } from "../features/knowledge/presenters";
import "./knowledge.css";

type PageProps = { onNavigate?: (page: string) => void };
type Version = KnowledgeVersion;
const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
const today = () => new Date().toLocaleDateString("sv-SE");

export function KnowledgePage({ onNavigate }: PageProps) {
  const { bases, setBases, save: saveBase } = useKnowledgeBases();
  const { docs, setDocs } = useKnowledgeDocuments();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState("全体员工");
  const basesLoaded = useRef(false);
  useEffect(() => {
    if (basesLoaded.current) return;
    basesLoaded.current = true;
    apiFetch<{ bases: KnowledgeBase[] }>("/api/knowledge/bases").then(
      (data) => {
        if (data?.bases.length) setBases(data.bases);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startEdit = (base?: KnowledgeBase) => {
    setEditing(base || null);
    setCreating(true);
    setName(base?.name || "");
    setDescription(base?.description || "");
    setAccess(base?.access || "全体员工");
  };
  const save = async () => {
    if (!name.trim()) return;
    if (bases.some((b) => b.name === name.trim() && b.id !== editing?.id)) {
      toast("已存在同名知识库，请换一个名称");
      return;
    }
    if (editing) {
      apiFetch(`/api/knowledge/bases/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          access,
        }),
      });
      setBases((current) =>
        current.map((b) =>
          b.id === editing.id
            ? {
                ...b,
                name: name.trim(),
                description: description.trim(),
                access,
              }
            : b,
        ),
      );
    } else {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        access,
      };
      const data = await apiFetch<{ base: KnowledgeBase }>(
        "/api/knowledge/bases",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setBases((current) => [
        ...current,
        data?.base ?? {
          id: crypto.randomUUID(),
          color: "purple",
          owner: "研发部",
          ...payload,
        },
      ]);
    }
    if (editing && editing.name !== name.trim())
      setDocs((current) =>
        current.map((d) =>
          d.category === editing.name ? { ...d, category: name.trim() } : d,
        ),
      );
    setCreating(false);
    toast(editing ? "知识库设置已保存" : "知识库已创建");
  };
  const open = (base: KnowledgeBase) => {
    sessionStorage.setItem("knowledge-hub:category", base.name);
    onNavigate?.("documents");
  };
  const icons = [BookOpen, Code2, FolderKanban, MessageSquareText];
  return (
    <div className="page-content kp-page">
      <PageHeader
        title="让团队知识，有序生长"
        description="按业务领域组织知识，让每一份经验都能被找到、被复用。"
        action={
          <button className="btn btn-primary" onClick={() => startEdit()}>
            <Plus size={17} />
            新建知识库
          </button>
        }
      />
      <div className="stats-grid kp-stats">
        <StatCard
          label="知识库"
          value={bases.length.toString().padStart(2, "0")}
          detail="覆盖核心业务领域"
          icon={<Database size={19} />}
        />
        <StatCard
          label="演示文档"
          value={docs.length}
          detail={`${docs.filter((d) => d.status === "已发布").length} 份已发布，可供检索`}
          icon={<FileText size={19} />}
        />
        <StatCard
          label="知识分块"
          value={docs.reduce((sum, doc) => sum + doc.chunks.length, 0)}
          detail="支持语义与父子分块"
          icon={<Layers3 size={19} />}
        />
        <StatCard
          label="权限覆盖"
          value="100%"
          detail="演示文档均包含权限元数据"
          icon={<ShieldCheck size={19} />}
        />
      </div>
      <div className="kp-section-title">
        <h3>
          全部知识库 <span>{bases.length}</span>
        </h3>
        <div className="kp-search">
          <Search size={16} />
          <input
            aria-label="搜索知识库"
            placeholder="搜索知识库…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="kp-base-grid">
        {bases
          .filter((b) => (b.name + b.description).includes(query))
          .map((base, index) => {
            const Icon = icons[index % icons.length];
            const count = docs.filter((d) => d.category === base.name).length;
            return (
              <article className="kp-base-card" key={base.id}>
                <div className="kp-base-top">
                  <span className={`kp-base-icon kp-color-${base.color}`}>
                    <Icon size={26} strokeWidth={1.65} />
                  </span>
                  <IconButton
                    label={`编辑${base.name}`}
                    onClick={() => startEdit(base)}
                  >
                    <Pencil size={16} />
                  </IconButton>
                </div>
                <h3>{base.name}</h3>
                <p>{base.description || "在这里沉淀团队知识与协作经验。"}</p>
                <div className="kp-base-meta">
                  <span>
                    <FileText size={14} />
                    {count} 份文档
                  </span>
                  <span>
                    <Users size={14} />
                    {base.owner}
                  </span>
                </div>
                <div className="kp-base-footer">
                  <span>
                    <LockKeyhole size={13} />
                    {base.access}
                  </span>
                  <button className="kp-text-button" onClick={() => open(base)}>
                    进入知识库
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            );
          })}
      </div>
      {!bases.some((b) => (b.name + b.description).includes(query)) && (
        <EmptyState
          title="未找到知识库"
          description="试试其他名称或业务关键词。"
        />
      )}
      <div className="kp-guide">
        <div className="kp-guide-icon">
          <Layers3 size={28} />
        </div>
        <div>
          <h3>知识的价值，从连接开始</h3>
          <p>
            导入文档 → 自动分块 → 写入权限 →
            生成索引，让团队经验成为可检索的知识。
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => onNavigate?.("documents")}
        >
          管理文档
          <ArrowRight size={15} />
        </button>
      </div>
      {creating && (
        <Modal
          title={editing ? "编辑知识库" : "新建知识库"}
          onClose={() => setCreating(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="kp-form"
          >
            <label className="field">
              知识库名称
              <input
                className="input"
                required
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：客户成功案例"
              />
            </label>
            <label className="field">
              知识库描述
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="这个知识库会帮助团队解决什么问题？"
              />
            </label>
            <label className="field">
              默认可见范围
              <select
                className="select"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
              >
                <option>全体员工</option>
                <option>研发部</option>
                <option>人力资源部</option>
                <option>项目成员</option>
              </select>
            </label>
            <div className="kp-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreating(false)}
              >
                取消
              </button>
              <button className="btn btn-primary" type="submit">
                {editing ? "保存设置" : "创建知识库"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function DocumentsPage({ onNavigate }: PageProps) {
  const { docs, setDocs, saveChunk, rollback, changeStatus } = useKnowledgeDocuments();
  const { bases } = useKnowledgeBases();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部");
  const [category, setCategory] = useState(() => {
    const stored = sessionStorage.getItem("knowledge-hub:category");
    sessionStorage.removeItem("knowledge-hub:category");
    return stored || "全部知识库";
  });
  const [upload, setUpload] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("内容分块");
  const [editedChunks, setEditedChunks] = useState<string[]>([]);
  const [editingChunk, setEditingChunk] = useState<number | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const doc = docs.find((d) => d.id === selected);
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
    setTab("内容分块");
    setEditingChunk(null);
    setDiff(null);
  };
  const updateStatus = (item: KnowledgeDocument) => {
    changeStatus(item);
    toast(`文档${item.status === "已发布" ? "已归档" : "已发布"}`);
  };
  const saveChunkLocal = async () => {
    if (!doc) return;
    if (editedChunks.some((c) => !c.trim())) {
      toast("分块内容不能为空");
      return;
    }
    let version = versionNext(doc);
    let serverDoc: KnowledgeDocument | null = null;
    for (let i = 0; i < editedChunks.length; i += 1) {
      if (editedChunks[i] === doc.chunks[i]) continue;
      const data = await apiFetch<{
        document: KnowledgeDocument;
        version: string;
      }>(`/api/knowledge/documents/${doc.id}/chunks/${i}`, {
        method: "PUT",
        body: JSON.stringify({ content: editedChunks[i] }),
      });
      if (data) {
        serverDoc = data.document;
        version = data.version;
      }
    }
    setDocs((current) =>
      current.map((d) =>
        d.id === doc.id
          ? serverDoc ?? {
              ...d,
              chunks: [...editedChunks],
              date: today(),
              stage: 0,
              task: "running",
              versions: [
                {
                  version,
                  date: today(),
                  note: "编辑知识分块，重新生成演示索引",
                  chunks: [...editedChunks],
                },
                ...d.versions,
              ],
            }
          : d,
      ),
    );
    setEditingChunk(null);
    toast(`已保存为 ${version}，正在演示重索引流程`);
  };
  const handleRollback = async (version: Version) => {
    if (!doc) return;
    const next = versionNext(doc);
    const data = await apiFetch<{ document: KnowledgeDocument }>(
      `/api/knowledge/documents/${doc.id}/rollback`,
      { method: "POST", body: JSON.stringify({ version: version.version }) },
    );
    setDocs((current) =>
      current.map((d) =>
        d.id === doc.id
          ? data?.document ?? {
              ...d,
              chunks: [...version.chunks],
              date: today(),
              stage: 0,
              task: "running",
              versions: [
                {
                  version: next,
                  date: today(),
                  note: `由 ${version.version} 回滚生成`,
                  chunks: [...version.chunks],
                },
                ...d.versions,
              ],
            }
          : d,
      ),
    );
    setEditedChunks([...version.chunks]);
    setDiff(null);
    toast(`已恢复 ${version.version} 内容，保留全部历史版本`);
  };
  return (
    <div className="page-content kp-page">
      <PageHeader
        title="文档中心"
        description="让知识从文档走向答案，统一管理每一份可信内容。"
        action={
          <button className="btn btn-primary" onClick={() => setUpload(true)}>
            <UploadCloud size={17} />
            上传文档
          </button>
        }
      />
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
        <div className="table-wrap">
          <table className="data-table kp-doc-table">
            <thead>
              <tr>
                <th>文档名称</th>
                <th>所属知识库</th>
                <th>状态</th>
                <th>分块 / 版本</th>
                <th>创建人</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      className="kp-document-name"
                      onClick={() => openDoc(item)}
                    >
                      <DocIcon type={item.type} />
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.size} · {item.department}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="kp-category-label">{item.category}</span>
                  </td>
                  <td>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                    {item.task === "running" && (
                      <span className="kp-processing">
                        <LoaderCircle size={11} />
                        处理中
                      </span>
                    )}
                  </td>
                  <td>
                    <span>{item.chunks.length} 个分块</span>
                    <small className="kp-cell-sub">
                      {item.versions[0].version}
                    </small>
                  </td>
                  <td>
                    <span className="kp-owner">
                      <span>{item.owner.slice(0, 1)}</span>
                      {item.owner}
                    </span>
                  </td>
                  <td className="kp-date">{item.date}</td>
                  <td>
                    <div className="kp-actions">
                      <IconButton
                        label={`预览${item.name}`}
                        onClick={() => openDoc(item)}
                      >
                        <BookOpen size={16} />
                      </IconButton>
                      <IconButton
                        disabled={item.task === "running"}
                        label={`${item.status === "已发布" ? "归档" : "发布"}${item.name}`}
                        onClick={() => updateStatus(item)}
                      >
                        {item.status === "已发布" ? (
                          <Archive size={16} />
                        ) : (
                          <UploadCloud size={16} />
                        )}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <EmptyState
            title="没有符合条件的文档"
            description="调整筛选条件，或上传一份新文档。"
          />
        )}
        <div className="kp-table-footer">
          <span>
            <ShieldCheck size={14} />
            每份文档均携带独立访问权限
          </span>
          <span>
            展示 {filtered.length} / {docs.length} 条
          </span>
        </div>
      </div>
      <p className="kp-demo-note">
        当前为前端交互演示，文件仅记录名称与大小，解析、向量化与权限校验均为模拟流程。
      </p>
      {upload && (
        <UploadModal
          categories={bases.map((b) => b.name)}
          onClose={() => setUpload(false)}
          onAdd={(items) => {
            setDocs((current) => [...items, ...current]);
            setUpload(false);
            setCategory("全部知识库");
            setStatus("全部");
            setQuery("");
            toast(`已添加 ${items.length} 份文档，开始演示处理流程`);
          }}
        />
      )}
      {doc && (
        <Modal wide title={doc.name} onClose={() => setSelected(null)}>
          <div className="kp-preview-meta">
            <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
            <span>{doc.category}</span>
            <span>{doc.versions[0].version}</span>
            <span>{doc.chunks.length} 个分块</span>
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
                  {doc.task === "running"
                    ? stages[doc.stage] + "（模拟）"
                    : "索引就绪（模拟）"}
                </Badge>
              </div>
              {doc.chunks.map((chunk, i) => (
                <div
                  className="kp-chunk"
                  key={`${doc.versions[0].version}-${i}`}
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
                        onClick={() => {
                          setEditedChunks([...doc.chunks]);
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
                          onClick={() => setEditingChunk(null)}
                        >
                          取消
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={saveChunkLocal}
                        >
                          保存并重索引
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
                    以下元数据会随每个分块保存，并用于检索前过滤与召回后二次校验。本页仅演示数据结构。
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
                    {doc.status === "已发布"
                      ? "允许在授权范围内检索"
                      : "未发布 / 归档文档不参与检索"}
                  </dd>
                </div>
              </dl>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelected(null);
                  onNavigate?.("permissions");
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

function UploadModal({
  categories,
  onClose,
  onAdd,
}: {
  categories: string[];
  onClose: () => void;
  onAdd: (docs: KnowledgeDocument[]) => void;
}) {
  const [mode, setMode] = useState("本地文件");
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState(categories[0] || "企业制度");
  const [strategy, setStrategy] = useState("语义分块");
  const [department, setDepartment] = useState("全体员工");
  const [level, setLevel] = useState("内部");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const addFiles = (input: File[]) => {
    const accepted = input.filter((file) =>
      /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|md|txt|png|jpe?g|webp)$/i.test(
        file.name,
      ),
    );
    if (accepted.length !== input.length)
      toast("部分文件格式不支持，请选择列表中的文档或图片格式");
    setFiles((current) => [
      ...current,
      ...accepted.filter(
        (f) => !current.some((c) => c.name === f.name && c.size === f.size),
      ),
    ]);
  };
  const submit = async () => {
    if (mode === "本地文件" && !files.length) return;
    if (mode === "网页链接" && !/^https?:\/\/[^\s]+$/i.test(url.trim())) {
      toast("请输入有效的 http 或 https 网页地址");
      return;
    }
    if (mode === "粘贴文本" && (!name.trim() || !content.trim())) return;
    const modeKey = mode === "本地文件" ? "file" : mode === "网页链接" ? "web" : "text";
    const payloads: Array<{
      mode: string;
      name: string;
      size?: string;
      source?: string;
      text?: string;
    }> =
      mode === "本地文件"
        ? files.map((f) => ({
            name: f.name,
            size:
              f.size > 1024 * 1024
                ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
                : `${Math.max(1, Math.round(f.size / 1024))} KB`,
            mode: "file",
          }))
        : [
            {
              name:
                mode === "网页链接"
                  ? name.trim() || new URL(url).hostname
                  : `${name.trim()}.md`,
              size: mode === "网页链接" ? "网页链接" : `${content.length} 字符`,
              source: mode === "网页链接" ? url.trim() : undefined,
              text: mode === "粘贴文本" ? content : undefined,
              mode: modeKey,
            },
          ];
    const results: KnowledgeDocument[] = [];
    for (const payload of payloads) {
      const data = await apiFetch<{ document: KnowledgeDocument }>(
        "/api/knowledge/documents/import",
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            category,
            department,
            level,
            owner: "张三",
          }),
        },
      );
      results.push(
        data?.document ?? {
          id: crypto.randomUUID(),
          name: payload.name,
          category,
          status: "草稿",
          type: mode === "网页链接" ? "WEB" : mode === "粘贴文本" ? "MD" : (payload.name.split(".").pop()?.toUpperCase() ?? "FILE"),
          size: payload.size ?? "—",
          owner: "张三",
          date: today(),
          chunks: [
            mode === "粘贴文本"
              ? content
              : "此文档仅保存文件元数据，演示环境未读取或解析本地文件内容。接入解析服务后，可在此查看真实知识分块。",
          ],
          versions: [
            {
              version: "v1.0",
              date: today(),
              note: "首次导入",
              chunks: mode === "粘贴文本" ? [content] : [],
            },
          ],
          department,
          level,
          strategy,
          stage: 0,
          task: "running",
          ...(mode === "网页链接" ? { source: url.trim() } : {}),
        },
      );
    }
    onAdd(results);
  };
  return (
    <Modal wide title="添加知识文档" onClose={onClose}>
      <div className="kp-upload-tabs">
        {["本地文件", "网页链接", "粘贴文本"].map((m, i) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
          >
            {i === 0 ? (
              <UploadCloud size={16} />
            ) : i === 1 ? (
              <Globe size={16} />
            ) : (
              <FileText size={16} />
            )}
            {m}
          </button>
        ))}
      </div>
      <form
        className="kp-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {mode === "本地文件" && (
          <>
            <div
              className={`kp-dropzone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <span>
                <UploadCloud size={30} />
              </span>
              <strong>
                拖拽文件到这里，或
                <button
                  type="button"
                  className="kp-text-button"
                  onClick={() => fileInput.current?.click()}
                >
                  选择文件
                </button>
              </strong>
              <p>PDF、Word、PPT、Excel、Markdown、TXT、图片</p>
              <small>演示模式仅保存文件名称与大小，不会上传文件内容</small>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.txt,.png,.jpg,.jpeg,.webp"
                aria-label="选择本地文档"
                onChange={(e) => addFiles(Array.from(e.target.files || []))}
                hidden
              />
            </div>
            {files.length > 0 && (
              <div className="kp-selected-files">
                {files.map((file, i) => (
                  <div key={`${file.name}-${file.size}`}>
                    <File size={16} />
                    <span>{file.name}</span>
                    <IconButton
                      label={`移除${file.name}`}
                      onClick={() =>
                        setFiles((current) => current.filter((_, n) => i !== n))
                      }
                    >
                      <X size={14} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {mode === "网页链接" && (
          <>
            <label className="field">
              网页地址
              <div className="kp-url-input">
                <Link2 size={17} />
                <input
                  required
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://docs.example.com/guide"
                />
              </div>
            </label>
            <label className="field">
              文档名称（可选）
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="默认使用网站域名"
              />
            </label>
          </>
        )}
        {mode === "粘贴文本" && (
          <>
            <label className="field">
              文档名称
              <input
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="为知识内容起一个清晰的名字"
              />
            </label>
            <label className="field">
              知识内容
              <textarea
                className="input"
                required
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="粘贴知识内容，支持 Markdown 文本…"
              />
            </label>
          </>
        )}
        <div className="kp-form-grid">
          <label className="field">
            所属知识库
            <select
              className="select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            分块策略
            <select
              className="select"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              <option>语义分块</option>
              <option>固定长度 · 500 字符</option>
              <option>父子分块</option>
            </select>
          </label>
          <label className="field">
            可见范围
            <select
              className="select"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option>全体员工</option>
              <option>研发部</option>
              <option>人力资源部</option>
              <option>财务部</option>
            </select>
          </label>
          <label className="field">
            文档密级
            <select
              className="select"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option>内部</option>
              <option>公开</option>
              <option>机密</option>
            </select>
          </label>
        </div>
        <div className="kp-inline-info">
          <ShieldCheck size={16} />
          权限元数据将写入每个知识分块；导入后保存为草稿。
        </div>
        <div className="kp-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={mode === "本地文件" && !files.length}
          >
            <UploadCloud size={16} />
            导入
            {files.length && mode === "本地文件"
              ? ` ${files.length} 份文档`
              : "文档"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TasksPage({ onNavigate }: PageProps) {
  const { stages, allTasks, retry: runTaskRetry } = useTasks();
  const [filter, setFilter] = useState("全部任务");
  const toast = useToast();
  const running = allTasks.filter((d) => d.task === "running").length;
  const errors = allTasks.filter((d) => d.task === "error").length;
  const visible = allTasks.filter(
    (d) =>
      filter === "全部任务" ||
      (filter === "处理中" && d.task === "running") ||
      (filter === "已完成" && d.task === "done") ||
      (filter === "失败" && d.task === "error"),
  );
  const retry = (item: KnowledgeDocument) => {
    runTaskRetry(item);
    toast("已重新加入演示处理队列");
  };
  return (
    <div className="page-content kp-page">
      <PageHeader
        title="每一步处理，都清晰可见"
        description="从原始文档到可检索知识，查看完整处理链路与任务状态。"
        action={
          <button
            className="btn btn-primary"
            onClick={() => onNavigate?.("documents")}
          >
            <Plus size={16} />
            导入新文档
          </button>
        }
      />
      <div className="stats-grid kp-stats">
        <StatCard
          label="任务总数"
          value={allTasks.length}
          detail="本地演示任务"
          icon={<Layers3 size={18} />}
        />
        <StatCard
          label="处理中"
          value={running}
          detail="自动更新处理状态"
          icon={<LoaderCircle size={18} />}
        />
        <StatCard
          label="已完成"
          value={allTasks.filter((d) => d.task === "done").length}
          detail="演示索引已就绪"
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="需要关注"
          value={errors}
          detail={errors ? "有任务需要重新处理" : "所有任务正常"}
          icon={<Clock3 size={18} />}
        />
      </div>
      <div className="panel kp-pipeline-card">
        <div className="kp-section-title">
          <h3>知识处理流水线</h3>
          <Badge tone="purple">演示模式</Badge>
        </div>
        <div className="kp-pipeline">
          {stages.map((stage, i) => (
            <div key={stage}>
              <span>
                <strong>{String(i + 1).padStart(2, "0")}</strong>
                <b>{stage}</b>
                <small>
                  {
                    [
                      "提取文本与结构",
                      "构建语义知识单元",
                      "绑定访问控制元数据",
                      "生成向量表示",
                      "支持混合检索",
                    ][i]
                  }
                </small>
              </span>
              {i < stages.length - 1 && <ChevronRight size={19} />}
            </div>
          ))}
        </div>
      </div>
      <div className="panel kp-task-panel">
        <div className="kp-doc-tabs">
          {["全部任务", "处理中", "已完成", "失败"].map((t) => (
            <button
              key={t}
              className={`kp-doc-tab ${filter === t ? "active" : ""}`}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="kp-tasks">
          {visible.map((item) => (
            <div className="kp-task-row" key={item.id}>
              <DocIcon type={item.type} />
              <div className="kp-task-main">
                <strong>{item.name}</strong>
                <span>
                  {item.category} · {item.strategy} · {item.size}
                </span>
              </div>
              <div className="kp-task-progress">
                <div className="kp-progress-track">
                  <span
                    className={item.task === "error" ? "error" : ""}
                    style={{
                      width: `${item.task === "error" ? 12 : (item.stage + 1) * 20}%`,
                    }}
                  />
                </div>
                <span>
                  {item.task === "done"
                    ? "全部步骤完成"
                    : item.task === "error"
                      ? "示例错误：扫描件文字识别失败"
                      : `${stages[item.stage]}中…`}
                </span>
              </div>
              <Badge
                tone={
                  item.task === "done"
                    ? "success"
                    : item.task === "error"
                      ? "danger"
                      : "purple"
                }
              >
                {item.task === "done"
                  ? "已完成"
                  : item.task === "error"
                    ? "处理失败"
                    : "处理中"}
              </Badge>
              <div className="kp-task-action">
                {item.task === "error" ? (
                  <button
                    className="kp-text-button"
                    onClick={() => retry(item)}
                  >
                    <RefreshCw size={14} />
                    重试
                  </button>
                ) : item.task === "running" ? (
                  <LoaderCircle className="kp-spin" size={18} />
                ) : (
                  <Check size={18} />
                )}
              </div>
            </div>
          ))}
        </div>
        {!visible.length && (
          <EmptyState
            title="当前没有此类任务"
            description="新的文档处理任务会显示在这里。"
          />
        )}
      </div>
      <p className="kp-demo-note">
        处理状态为前端模拟，未连接文档解析、OCR、Embedding 或向量数据库服务。
      </p>
    </div>
  );
}
