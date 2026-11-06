import { ChevronRight } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RequestStatus } from "./components/RequestStatus";
import { Modal, ToastProvider } from "./components/ui";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import type { KnowledgeDocument } from "./features/knowledge/types";
import { useResource } from "./hooks/useResource";
import { navigation } from "./layouts/navigation";
import { Sidebar } from "./layouts/Sidebar";
import { Topbar } from "./layouts/Topbar";
const ChatPage = lazy(() => import("./pages/ChatPage"));
import { ThemeProvider } from "./providers/ThemeProvider";
import { WorkspaceProvider } from "./providers/WorkspaceProvider";

const OverviewPage = lazy(() => import("./pages/OverviewPage"));
const KnowledgePage = lazy(() =>
  import("./pages/KnowledgePage").then((module) => ({
    default: module.KnowledgePage,
  })),
);
const DocumentsPage = lazy(() =>
  import("./pages/DocumentsPage").then((module) => ({
    default: module.DocumentsPage,
  })),
);
const TasksPage = lazy(() =>
  import("./pages/TasksPage").then((module) => ({
    default: module.TasksPage,
  })),
);
const PermissionsPage = lazy(() =>
  import("./pages/PermissionsPage").then((module) => ({
    default: module.PermissionsPage,
  })),
);
const AuditPage = lazy(() =>
  import("./pages/AuditPage").then((module) => ({
    default: module.AuditPage,
  })),
);
const EvaluationPage = lazy(() =>
  import("./pages/EvaluationPage").then((module) => ({
    default: module.EvaluationPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const RetrievalPage = lazy(() =>
  import("./pages/RetrievalPage").then((module) => ({
    default: module.RetrievalPage,
  })),
);

const pageResults = navigation.map((item) => ({
  id: item.id,
  label: item.label,
  sub: "工作空间功能",
}));
function WorkspaceSearch({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (page: string) => void;
}) {
  const [query, setQuery] = useState("");
  const resource = useResource<{ documents: KnowledgeDocument[] }>(
    "/api/knowledge/documents",
    { documents: [] },
  );
  const results = [
    ...pageResults,
    ...(resource.data?.documents ?? []).map((doc) => ({
      id: "documents",
      label: doc.name,
      sub: doc.category,
    })),
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <Modal title="搜索工作空间" onClose={onClose}>
      <input
        className="input"
        aria-label="搜索工作空间"
        placeholder="搜索功能或已保存的文档…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <RequestStatus {...resource} />
      <div className="search-results">
        {results.map((item, index) => (
          <button
            key={`${item.id}-${index}`}
            onClick={() => {
              if (item.id === "documents")
                sessionStorage.setItem(
                  "knowledge-hub:document-query",
                  item.label,
                );
              onNavigate(item.id);
              onClose();
            }}
          >
            <span>
              {item.label}
              <small>{item.sub}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
        {!results.length && <p>未找到匹配的结果</p>}
      </div>
    </Modal>
  );
}

function Workspace() {
  const [page, setPage] = useState(() =>
    navigation.some((n) => n.id === location.hash.slice(1))
      ? location.hash.slice(1)
      : "chat",
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const commitNavigation = (id: string) => {
    if (navigation.some((n) => n.id === id)) {
      setPage(id);
      location.hash = id;
      setMobileNav(false);
    }
  };
  const navigate = (id: string) => {
    if (
      id !== page &&
      !window.dispatchEvent(
        new Event("knowledge-hub:before-navigate", { cancelable: true }),
      )
    ) {
      setPendingNavigation(id);
      return;
    }
    commitNavigation(id);
  };
  useEffect(() => {
    const hash = () => {
      const p = location.hash.slice(1);
      const target = navigation.some((n) => n.id === p) ? p : "chat";
      if (
        target !== page &&
        !window.dispatchEvent(
          new Event("knowledge-hub:before-navigate", { cancelable: true }),
        )
      ) {
        history.replaceState(null, "", `#${page}`);
        setPendingNavigation(target);
        return;
      }
      setPage(target);
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
  }, [page]);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#workspace-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("workspace-content")?.focus();
        }}
      >
        跳转到内容
      </a>
      {mobileNav && (
        <div className="nav-scrim" onClick={() => setMobileNav(false)} />
      )}
      <Sidebar
        page={page}
        onNavigate={navigate}
        mobileOpen={mobileNav}
        onClose={() => setMobileNav(false)}
      />
      <div className="main-shell">
        <Topbar
          page={page}
          onNavigate={navigate}
          onOpenMobileNav={() => setMobileNav(true)}
          onOpenSearch={() => setSearch("")}
        />
        <ConnectionStatus />
        <main
          id="workspace-content"
          tabIndex={-1}
          className={`main-content ${page === "chat" ? "main-chat" : ""}`}
        >
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
      <ConfirmDialog
        open={pendingNavigation !== null}
        title={
          page === "settings" ? "离开未保存的设置？" : "离开未保存的内容？"
        }
        description="尚未保存的修改将丢失。"
        confirmLabel="放弃修改并离开"
        onCancel={() => setPendingNavigation(null)}
        onConfirm={() => {
          const target = pendingNavigation;
          setPendingNavigation(null);
          if (target) {
            setPage(target);
            history.pushState(null, "", `#${target}`);
            setMobileNav(false);
          }
        }}
      />
      {search !== null && (
        <WorkspaceSearch
          onClose={() => setSearch(null)}
          onNavigate={navigate}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <WorkspaceProvider>
          <ErrorBoundary>
            <Workspace />
          </ErrorBoundary>
        </WorkspaceProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
