import { useState } from "react";
import {
  Bell,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Menu,
  Search,
  ShieldCheck,
} from "lucide-react";
import { IconButton, Modal, useToast } from "../components/ui";
import { descriptions, navigation } from "./navigation";
import { BookOpen, Sparkles, ArrowUpRight } from "lucide-react";

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
  const [read, setRead] = useState(false);
  const toast = useToast();
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
          <span>搜索文档、知识库…</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="topbar-icon-wrap">
          <IconButton
            label="消息通知"
            onClick={() =>
              setPopover(popover === "notifications" ? null : "notifications")
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
          onClick={() => setPopover(popover === "profile" ? null : "profile")}
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
          <div className="popover-dismiss" onClick={() => setPopover(null)} />
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
                <small className="demo-account-note">
                  当前为本地演示账号
                </small>
              </>
            )}
          </div>
        </>
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
    </header>
  );
}
