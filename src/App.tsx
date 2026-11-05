import { lazy, Suspense, useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  House,
  Layers3,
  Menu,
  MessageSquareText,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { IconButton, Modal, ToastProvider, useToast } from "./components/ui";
import ChatPage from "./pages/ChatPage";
const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const KnowledgePage = lazy(() =>
  import("./pages/KnowledgePages").then((module) => ({
    default: module.KnowledgePage,
  })),
);
const DocumentsPage = lazy(() =>
  import("./pages/KnowledgePages").then((module) => ({
    default: module.DocumentsPage,
  })),
);
const TasksPage = lazy(() =>
  import("./pages/KnowledgePages").then((module) => ({
    default: module.TasksPage,
  })),
);
const PermissionsPage = lazy(() =>
  import("./pages/GovernancePages").then((module) => ({
    default: module.PermissionsPage,
  })),
);
const AuditPage = lazy(() =>
  import("./pages/GovernancePages").then((module) => ({
    default: module.AuditPage,
  })),
);
const EvaluationPage = lazy(() =>
  import("./pages/GovernancePages").then((module) => ({
    default: module.EvaluationPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/GovernancePages").then((module) => ({
    default: module.SettingsPage,
  })),
);
const RetrievalPage = lazy(() =>
  import("./pages/GovernancePages").then((module) => ({
    default: module.RetrievalPage,
  })),
);

const navigation = [
  { id: "overview", label: "工作台总览", icon: House },
  { id: "chat", label: "AI 知识助手", icon: MessageSquareText, badge: "AI" },
  { id: "knowledge", label: "知识库管理", icon: Database },
  { id: "documents", label: "文档中心", icon: FileText },
  { id: "retrieval", label: "检索实验室", icon: Search },
  { id: "tasks", label: "知识处理任务", icon: Workflow, badge: "3" },
  { id: "evaluation", label: "质量评测", icon: ChartNoAxesCombined },
  { id: "permissions", label: "权限与组织", icon: ShieldCheck },
  { id: "audit", label: "审计中心", icon: Activity },
  { id: "settings", label: "系统设置", icon: Settings2 },
];
const descriptions: Record<string, string> = {
  chat: "连接企业知识，让每一个答案都有依据",
  overview: "让知识成为团队持续成长的力量",
  knowledge: "有序沉淀知识，连接每一个业务场景",
  documents: "从一份文档开始，构建可信的企业知识",
  retrieval: "让每一次检索都可解释、可调优",
  tasks: "从原始文档到可检索知识，全程清晰可见",
  evaluation: "用数据衡量知识的价值，让答案持续变好",
  permissions: "让合适的人，在合适的范围内获取知识",
  audit: "每一次访问与操作，都有迹可循",
  settings: "为你的团队配置更合适的知识工作空间",
};

function Workspace() {
  const [page, setPage] = useState(() =>
    navigation.some((n) => n.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "chat",
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [popover, setPopover] = useState<"notifications" | "profile" | null>(
    null,
  );
  const [help, setHelp] = useState(false);
  const [read, setRead] = useState(false);
  const toast = useToast();
  const current = navigation.find((n) => n.id === page)!;
  const navigate = (id: string) => {
    if (navigation.some((n) => n.id === id)) {
      setPage(id);
      location.hash = id;
      setMobileNav(false);
      setPopover(null);
    }
  };
  useEffect(() => {
    const hash = () => {
      const p = location.hash.slice(1);
      if (navigation.some((n) => n.id === p)) setPage(p);
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch("");
      }
      if (e.key === "Escape") {
        setPopover(null);
        setMobileNav(false);
      }
    };
    addEventListener("hashchange", hash);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("hashchange", hash);
      removeEventListener("keydown", key);
    };
  }, []);
  return (
    <div className="app-shell">
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="知序工作台"
        >
          <span className="brand-mark">
            <Layers3 size={28} strokeWidth={2} />
          </span>
          <span>
            <strong>
              知序 <span>Knowledge Hub</span>
            </strong>
            <small>企业知识库助手</small>
          </span>
        </button>
        <div className="workspace-switch">
          <span className="workspace-initial">K</span>
          <div>
            <strong>企业工作空间</strong>
            <small>
              <span className="status-dot" /> 团队协作版
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="sidebar-nav">
          <div className="nav-section-label">工作空间</div>
          <nav aria-label="主导航">
            {navigation.map((item, i) => (
              <div key={item.id}>
                {i === 7 && (
                  <div className="nav-section-label governance-label">
                    管理与治理
                  </div>
                )}
                <button
                  className={`nav-item ${page === item.id ? "selected" : ""}`}
                  onClick={() => navigate(item.id)}
                  aria-current={page === item.id ? "page" : undefined}
                >
                  <item.icon size={19} strokeWidth={1.75} />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`nav-badge ${item.badge === "AI" ? "nav-badge-ai" : ""}`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {page === item.id && <span className="nav-indicator" />}
                </button>
              </div>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="storage-card">
            <div className="storage-heading">
              <Database size={15} />
              <span>知识资产概况</span>
              <span>57%</span>
            </div>
            <div className="storage-bar">
              <span />
            </div>
            <p>
              <strong>2,846</strong> / 5,000 篇文档
              <button
                onClick={() => navigate("knowledge")}
                aria-label="查看知识资产"
              >
                <ArrowUpRight size={15} />
              </button>
            </p>
          </div>
          <div className="sidebar-status">
            <span className="status-dot" /> 所有系统运行正常 <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-heading">
            <IconButton
              label="展开导航"
              className="mobile-menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </IconButton>
            <div>
              <div className="breadcrumb">
                工作空间 <ChevronRight size={11} /> {current.label}
              </div>
              <h1>
                {current.label}
                {page === "chat" && <span className="title-ai">AI</span>}
              </h1>
              <p>{descriptions[page]}</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setSearch("")}>
              <Search size={17} />
              <span>搜索文档、知识库…</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="topbar-icon-wrap">
              <IconButton
                label="消息通知"
                onClick={() =>
                  setPopover(
                    popover === "notifications" ? null : "notifications",
                  )
                }
              >
                <Bell size={20} />
                {!read && <span className="notification-dot" />}
              </IconButton>
            </div>
            <IconButton label="使用帮助" onClick={() => setHelp(true)}>
              <CircleHelp size={20} />
            </IconButton>
            <div className="topbar-divider" />
            <button
              className="profile-button"
              onClick={() =>
                setPopover(popover === "profile" ? null : "profile")
              }
            >
              <span className="avatar avatar-user">张</span>
              <span>
                <strong>张三</strong>
                <small>研发部</small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
          {popover && (
            <>
              <div
                className="popover-dismiss"
                onClick={() => setPopover(null)}
              />
              <div className="topbar-popover">
                {popover === "notifications" ? (
                  <>
                    <div className="popover-title">
                      <strong>消息通知</strong>
                      <button
                        className="text-button"
                        onClick={() => {
                          setRead(true);
                          toast("已将全部通知标为已读");
                        }}
                      >
                        全部已读
                      </button>
                    </div>
                    <button
                      className="notification-item"
                      onClick={() => navigate("tasks")}
                    >
                      <span className="notification-symbol">
                        <Check size={17} />
                      </span>
                      <span>
                        <strong>知识处理已完成</strong>
                        <p>《员工休假管理制度》已完成索引</p>
                        <small>10 分钟前 · 演示通知</small>
                      </span>
                    </button>
                    <button
                      className="notification-item"
                      onClick={() => navigate("evaluation")}
                    >
                      <span className="notification-symbol purple">
                        <ChartNoAxesCombined size={17} />
                      </span>
                      <span>
                        <strong>每周质量报告已就绪</strong>
                        <p>本周检索命中率为 96.8%</p>
                        <small>1 小时前 · 演示通知</small>
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="profile-details">
                      <span className="avatar avatar-user">张</span>
                      <div>
                        <strong>张三</strong>
                        <p>zhangsan@example.com</p>
                      </div>
                    </div>
                    <div className="profile-role">
                      <ShieldCheck size={15} />
                      研发部 · 知识管理员
                    </div>
                    <button
                      className="profile-menu-item"
                      onClick={() => navigate("permissions")}
                    >
                      组织与权限 <ChevronRight size={15} />
                    </button>
                    <button
                      className="profile-menu-item"
                      onClick={() => navigate("settings")}
                    >
                      工作空间设置 <ChevronRight size={15} />
                    </button>
                    <small className="demo-account-note">
                      当前为本地演示账号
                    </small>
                  </>
                )}
              </div>
            </>
          )}
        </header>
        <main className={`main-content ${page === "chat" ? "main-chat" : ""}`}>
          <Suspense
            fallback={
              <div className="page-loading" role="status">
                <span />
                正在打开工作空间…
              </div>
            }
          >
            {page === "chat" && <ChatPage />}
            {page === "overview" && <OverviewPage onNavigate={navigate} />}
            {page === "knowledge" && <KnowledgePage onNavigate={navigate} />}
            {page === "documents" && <DocumentsPage onNavigate={navigate} />}
            {page === "tasks" && <TasksPage onNavigate={navigate} />}
            {page === "retrieval" && <RetrievalPage />}
            {page === "evaluation" && <EvaluationPage />}
            {page === "permissions" && <PermissionsPage />}
            {page === "audit" && <AuditPage />}
            {page === "settings" && <SettingsPage />}
          </Suspense>
        </main>
      </div>
      {search !== null && (
        <Modal title="搜索工作空间" onClose={() => setSearch(null)}>
          <div className="search-modal-input">
            <Search size={20} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索功能、文档或知识库…"
            />
          </div>
          <div className="search-results">
            {[
              ...navigation.map((n) => ({
                id: n.id,
                label: n.label,
                sub: "工作空间功能",
              })),
              {
                id: "documents",
                label: "员工休假管理制度.pdf",
                sub: "企业制度库 · 已发布",
              },
              {
                id: "documents",
                label: "人力资源管理手册.docx",
                sub: "企业制度库 · 已发布",
              },
              {
                id: "documents",
                label: "研发 API 接入指南.md",
                sub: "技术文档库 · 已发布",
              },
            ]
              .filter(
                (n) =>
                  !search ||
                  n.label.toLowerCase().includes(search.toLowerCase()),
              )
              .map((n, i) => (
                <button
                  key={`${n.id}-${i}`}
                  onClick={() => {
                    navigate(n.id);
                    setSearch(null);
                  }}
                >
                  <span className="search-result-icon">
                    {n.sub === "工作空间功能" ? (
                      <Layers3 size={17} />
                    ) : (
                      <FileText size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{n.label}</strong>
                    <small>{n.sub}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            {search &&
              !navigation.some((n) =>
                n.label.toLowerCase().includes(search.toLowerCase()),
              ) &&
              ![
                "员工休假管理制度.pdf",
                "人力资源管理手册.docx",
                "研发 API 接入指南.md",
              ].some((n) => n.toLowerCase().includes(search.toLowerCase())) && (
                <p className="search-empty">
                  未找到相关内容，试试“文档”或“权限”。
                </p>
              )}
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="欢迎使用知序" onClose={() => setHelp(false)}>
          <div className="help-intro">
            <span className="help-logo">
              <Layers3 size={30} />
            </span>
            <h3>让企业知识，真正流动起来。</h3>
            <p>沿着知识的全生命周期，探索你的工作空间。</p>
          </div>
          <div className="help-step">
            <BookOpen />
            <div>
              <h4>01 · 知识怎么进入</h4>
              <p>在文档中心导入资料，体验分块、版本管理和处理流程。</p>
            </div>
          </div>
          <div className="help-step">
            <Sparkles />
            <div>
              <h4>02 · 知识怎么被找到</h4>
              <p>向 AI 助手提问，查看引用原文，在检索实验室调试召回。</p>
            </div>
          </div>
          <div className="help-step">
            <ShieldCheck />
            <div>
              <h4>03 · 知识怎么被信任</h4>
              <p>检查权限范围、检索过程和审计记录，使用评测衡量效果。</p>
            </div>
          </div>
          <div className="info-callout">
            这是纯前端交互演示。回答、检索、权限和指标使用模拟数据；浏览器本地保存演示操作，不会上传文件或调用模型。
          </div>
          <button
            className="btn btn-primary help-start"
            onClick={() => setHelp(false)}
          >
            开始探索 <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
export default function App() {
  return (
    <ToastProvider>
      <Workspace />
    </ToastProvider>
  );
}
