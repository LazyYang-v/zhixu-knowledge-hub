import { useDialogFocus } from "../hooks/useDialogFocus";
import { ArrowUpRight, ChevronDown, Database, Layers3 } from "lucide-react";
import { getDataMode } from "../lib/data-mode";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { navigation } from "./navigation";

export function Sidebar({
  page,
  onNavigate,
  mobileOpen,
  onClose,
}: {
  page: string;
  onNavigate: (id: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const sidebarRef = useDialogFocus(mobileOpen, onClose);
  const { overview, health } = useWorkspace();
  return (
    <aside
      ref={sidebarRef}
      tabIndex={-1}
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? true : undefined}
      aria-label={mobileOpen ? "主导航" : undefined}
      className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}
    >
      <button
        className="brand"
        onClick={() => onNavigate("overview")}
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
                onClick={() => onNavigate(item.id)}
                aria-current={page === item.id ? "page" : undefined}
              >
                <item.icon size={19} strokeWidth={1.75} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`nav-badge ${item.badge === "AI" ? "nav-badge-ai" : ""}`}
                  >
                    {item.id === "tasks"
                      ? (overview.data?.stats.tasks.running ?? "—")
                      : item.badge}
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
            <span>
              {getDataMode() === "demo"
                ? "演示"
                : (overview.data?.stats.bases ?? "—")}{" "}
              个库
            </span>
          </div>
          <div className="storage-bar">
            <span />
          </div>
          <p>
            <strong>{overview.data?.stats.documents ?? "—"}</strong> 份文档记录
            <button
              onClick={() => onNavigate("knowledge")}
              aria-label="查看知识资产"
            >
              <ArrowUpRight size={15} />
            </button>
          </p>
        </div>
        <div className="sidebar-status">
          <span className="status-dot" />{" "}
          {getDataMode() === "demo"
            ? "本地演示"
            : health.loading
              ? "检查连接中"
              : health.error
                ? "API 无法连接"
                : "API 可连接"}{" "}
          <span>v1.0</span>
        </div>
      </div>
    </aside>
  );
}
