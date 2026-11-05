import { lazy, Suspense, useEffect, useState } from "react";
import { FileText, Layers3, ChevronRight, Search } from "lucide-react";
import { Modal, ToastProvider } from "./components/ui";
import { navigation } from "./layouts/navigation";
import { Sidebar } from "./layouts/Sidebar";
import { Topbar } from "./layouts/Topbar";
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

const searchResults = [
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
];

function Workspace() {
  const [page, setPage] = useState(() =>
    navigation.some((n) => n.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "chat",
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const navigate = (id: string) => {
    if (navigation.some((n) => n.id === id)) {
      setPage(id);
      location.hash = id;
      setMobileNav(false);
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
      <Sidebar page={page} onNavigate={navigate} mobileOpen={mobileNav} />
      <div className="main-shell">
        <Topbar
          page={page}
          onNavigate={navigate}
          onOpenMobileNav={() => setMobileNav(true)}
          onOpenSearch={() => setSearch("")}
        />
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
              aria-label="搜索工作空间"
            />
          </div>
          <div className="search-results">
            {searchResults
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
              searchResults.every(
                (n) => !n.label.toLowerCase().includes(search.toLowerCase()),
              ) && (
                <p className="search-empty">
                  未找到相关内容，试试“文档”或“权限”。
                </p>
              )}
          </div>
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
