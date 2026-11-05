import { ArrowUpRight, ChevronDown, Database, Layers3 } from "lucide-react";
import { navigation } from "./navigation";

export function Sidebar({
  page,
  onNavigate,
  mobileOpen,
}: {
  page: string;
  onNavigate: (id: string) => void;
  mobileOpen: boolean;
}) {
  return (
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
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
              onClick={() => onNavigate("knowledge")}
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
  );
}
