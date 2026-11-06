import {
  ArrowRight,
  BookOpen,
  Code2,
  Database,
  FileText,
  FolderKanban,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState } from "react";
import { RequestStatus } from "../components/RequestStatus";
import {
  EmptyState,
  IconButton,
  Modal,
  PageHeader,
  StatCard,
  useToast,
} from "../components/ui";
import { Field } from "../components/ui/Field";
import { Button, DataTable, Tabs } from "../components/ui/index";
import type {
  KnowledgeBase,
  KnowledgeVersion,
} from "../features/knowledge/types";
import { useKnowledgeDocuments } from "../features/knowledge/useKnowledge";
import { useKnowledgeBases } from "../features/knowledge/useKnowledgeBases";
import { useAction } from "../hooks/useAction";
import { useAuthorization } from "../hooks/useAuthorization";
import "./knowledge.css";
type PageProps = { onNavigate?: (page: string) => void };
type Version = KnowledgeVersion;
const stages = ["文档解析", "文本切分", "权限注入", "向量化", "索引就绪"];
const today = () => new Date().toLocaleDateString("sv-SE");

export function KnowledgePage({ onNavigate }: PageProps) {
  const { bases, save: saveBase, loading, error, reload } = useKnowledgeBases();
  const { run, pending } = useAction();
  const { can, canBase } = useAuthorization();
  const [view, setView] = useState("grid");
  const [sort, setSort] = useState("name");
  const {
    docs,
    loading: docsLoading,
    error: docsError,
    reload: reloadDocs,
  } = useKnowledgeDocuments();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState("全体员工");
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
    await saveBase({
      id: editing?.id,
      name: name.trim(),
      description: description.trim(),
      access,
    });
    setCreating(false);
    toast(editing ? "知识库设置已保存" : "知识库已创建", "success");
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
          <button
            className="btn btn-primary"
            disabled={!can("base.create")}
            onClick={() => startEdit()}
          >
            <Plus size={17} />
            新建知识库
          </button>
        }
      />
      <RequestStatus
        loading={loading || docsLoading}
        error={error ?? docsError}
        reload={() => {
          reload();
          reloadDocs();
        }}
      />
      <div className="stats-grid kp-stats">
        <StatCard
          label="知识库"
          value={bases.length.toString().padStart(2, "0")}
          detail="覆盖核心业务领域"
          icon={<Database size={19} />}
        />
        <StatCard
          label="文档记录"
          value={docs.length}
          detail={`${docs.filter((d) => d.status === "已发布").length} 份已发布，可供检索`}
          icon={<FileText size={19} />}
        />
        <StatCard
          label="知识分块"
          value={docs.reduce((sum, doc) => sum + doc.chunks.length, 0)}
          detail="当前保存的文本分块"
          icon={<Layers3 size={19} />}
        />
        <StatCard
          label="权限覆盖"
          value="未接入"
          detail="权限元数据不等于访问控制"
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
      <div className="collection-controls">
        <Tabs
          ariaLabel="知识库视图"
          value={view}
          onChange={setView}
          tabs={[
            { id: "grid", label: "卡片" },
            { id: "table", label: "表格" },
          ]}
        />
        <select
          className="select"
          aria-label="知识库排序"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">名称排序</option>
          <option value="count">文档数量</option>
        </select>
      </div>
      {view === "table" ? (
        <DataTable
          ariaLabel="知识库列表"
          rows={bases.filter((b) => (b.name + b.description).includes(query))}
          rowKey={(b) => b.id}
          loading={loading}
          columns={[
            {
              key: "name",
              header: "知识库",
              render: (b) => (
                <button className="text-button" onClick={() => open(b)}>
                  {b.name}
                </button>
              ),
              sortable: true,
              sortValue: (b) => b.name,
            },
            {
              key: "documents",
              header: "文档",
              render: (b) => docs.filter((d) => d.category === b.name).length,
              sortable: true,
              sortValue: (b) =>
                docs.filter((d) => d.category === b.name).length,
            },
            { key: "owner", header: "负责人", render: (b) => b.owner },
            {
              key: "action",
              header: "操作",
              render: (b) => (
                <Button
                  variant="ghost"
                  disabled={!canBase(b.id, "manage")}
                  onClick={() => startEdit(b)}
                >
                  编辑
                </Button>
              ),
            },
          ]}
        />
      ) : (
        <div className="kp-base-grid">
          {bases
            .filter((b) => (b.name + b.description).includes(query))
            .sort((a, b) =>
              sort === "count"
                ? docs.filter((d) => d.category === b.name).length -
                  docs.filter((d) => d.category === a.name).length
                : a.name.localeCompare(b.name, "zh-CN"),
            )
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
                      disabled={!canBase(base.id, "manage")}
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
                    <button
                      className="kp-text-button"
                      onClick={() => open(base)}
                    >
                      进入知识库
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
        </div>
      )}
      {!loading &&
        !error &&
        !bases.some((b) => (b.name + b.description).includes(query)) && (
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
            目标流程（解析与索引待接入）：导入文档 → 自动分块 → 写入权限 →
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
              void run(save);
            }}
            className="kp-form"
          >
            <Field label="知识库名称" required>
              <input
                className="input"
                required
                maxLength={30}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：客户成功案例"
              />
            </Field>
            <Field label="知识库描述">
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="这个知识库会帮助团队解决什么问题？"
              />
            </Field>
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
              <Button loading={pending} type="submit">
                {editing ? "保存设置" : "创建知识库"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
