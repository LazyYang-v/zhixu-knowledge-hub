import {
  ArrowUpRight,
  Bell,
  BookOpen,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { IconButton, Modal, useToast } from "../components/ui";
import { getDataMode } from "../lib/data-mode";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useAction } from "../hooks/useAction";
import { ChangePasswordDialog } from "../components/ChangePasswordDialog";
import { descriptions, navigation } from "./navigation";

export function Topbar({
  page,
  onNavigate,
  onOpenMobileNav,
  onOpenSearch,
}: {
  page: string;
  onNavigate: (id: string) => void;
  onOpenMobileNav: () => void;
  onOpenSearch: () => void;
}) {
  const [popover, setPopover] = useState<"notifications" | "profile" | null>(
    null,
  );
  const [help, setHelp] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [read, setRead] = useState(false);
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const auth = useAuth();
  const { run, pending } = useAction();
  const current = navigation.find((n) => n.id === page)!;
  return (
    <header className="topbar">
      <div className="topbar-heading">
        <IconButton
          label="展开导航"
          className="mobile-menu"
          onClick={onOpenMobileNav}
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
        <button className="global-search" onClick={onOpenSearch}>
          <Search size={17} />
          <span>搜索功能、文档…</span>
          <kbd>⌘ K</kbd>
        </button>
        <select
          className="theme-select"
          aria-label="外观主题"
          value={theme}
          onChange={(event) =>
            setTheme(event.target.value as "light" | "dark" | "system")
          }
        >
          <option value="system">跟随系统</option>
          <option value="light">浅色</option>
          <option value="dark">深色</option>
        </select>
        <div className="topbar-icon-wrap">
          <IconButton
            label="消息通知"
            onClick={() =>
              setPopover(popover === "notifications" ? null : "notifications")
            }
          >
            <Bell size={20} />
            {getDataMode() === "demo" && !read && (
              <span className="notification-dot" />
            )}
          </IconButton>
        </div>
        <IconButton label="使用帮助" onClick={() => setHelp(true)}>
          <CircleHelp size={20} />
        </IconButton>
        <div className="topbar-divider" />
        <button
          className="profile-button"
          onClick={() => setPopover(popover === "profile" ? null : "profile")}
        >
          <span className="avatar avatar-user">
            {auth.user?.name.slice(-1) ?? "张"}
          </span>
          <span>
            <strong>{auth.user?.name ?? "张三"}</strong>
            <small>
              {auth.user
                ? { admin: "管理员", editor: "编辑者", viewer: "普通成员" }[
                    auth.user.role
                  ]
                : "示例身份"}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
      </div>
      {popover && (
        <>
          <div className="popover-dismiss" onClick={() => setPopover(null)} />
          <div className="topbar-popover">
            {popover === "notifications" && getDataMode() === "server" ? (
              <div className="popover-title">
                通知服务尚未接入；请在任务页查看记录。
              </div>
            ) : popover === "notifications" ? (
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
                  onClick={() => onNavigate("tasks")}
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
                  onClick={() => onNavigate("evaluation")}
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
                  <span className="avatar avatar-user">
                    {auth.user?.name.slice(-1) ?? "张"}
                  </span>
                  <div>
                    <strong>{auth.user?.name ?? "张三"}</strong>
                    <p>{auth.user?.email ?? "zhangsan@example.com"}</p>
                  </div>
                </div>
                <div className="profile-role">
                  <ShieldCheck size={15} />
                  {auth.user
                    ? `已登录 · ${auth.user.tenantId}`
                    : "示例身份 · 尚未认证"}
                </div>
                <button
                  className="profile-menu-item"
                  onClick={() => onNavigate("permissions")}
                >
                  组织与权限 <ChevronRight size={15} />
                </button>
                <button
                  className="profile-menu-item"
                  onClick={() => onNavigate("settings")}
                >
                  工作空间设置 <ChevronRight size={15} />
                </button>
                {auth.user && (
                  <button
                    className="profile-menu-item"
                    onClick={() => {
                      setPopover(null);
                      setPasswordDialog(true);
                    }}
                  >
                    修改密码
                  </button>
                )}
                {auth.user ? (
                  <button
                    className="profile-menu-item"
                    disabled={pending}
                    onClick={() => void run(auth.logout)}
                  >
                    {pending ? "正在退出…" : "退出登录"}
                  </button>
                ) : (
                  <small className="demo-account-note">
                    当前为示例身份，尚未认证
                  </small>
                )}
              </>
            )}
          </div>
        </>
      )}
      {passwordDialog && (
        <ChangePasswordDialog onClose={() => setPasswordDialog(false)} />
      )}
      {help && (
        <Modal title="欢迎使用知序" onClose={() => setHelp(false)}>
          <div className="help-intro">
            <span className="help-logo">
              <Sparkles size={30} />
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
            服务端模式使用 REST API
            保存记录；本地演示模式仅使用浏览器数据。原件可实际上传，TXT/Markdown
            支持后台处理；问答仍是规则演示，真实模型与索引尚未接入。
            {auth.user
              ? "当前已启用本地登录与后端资源授权。"
              : "当前服务未配置真实身份授权。"}
          </div>
          <button
            className="btn btn-primary help-start"
            onClick={() => setHelp(false)}
          >
            开始探索 <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
    </header>
  );
}
