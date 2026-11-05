import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Layers3,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";
import { Badge, PageHeader, StatCard } from "../components/ui";
import "./overview.css";

type OverviewProps = { onNavigate: (page: string) => void };
const popular = [
  {
    title: "员工休假管理制度",
    category: "企业制度",
    extension: "PDF",
    count: 328,
    color: "red",
    progress: 92,
  },
  {
    title: "研发团队 API 设计规范",
    category: "技术文档",
    extension: "MD",
    count: 256,
    color: "purple",
    progress: 73,
  },
  {
    title: "差旅与费用报销指南",
    category: "企业制度",
    extension: "DOC",
    count: 219,
    color: "blue",
    progress: 62,
  },
  {
    title: "新员工入职操作手册",
    category: "企业制度",
    extension: "PDF",
    count: 186,
    color: "red",
    progress: 53,
  },
];
const activity = [
  {
    icon: FileText,
    color: "purple",
    text: "李明更新了「研发团队 API 设计规范」",
    detail: "技术文档 · v2.3 · 自动重索引完成",
    time: "10 分钟前",
    type: "documents",
    page: "documents",
  },
  {
    icon: ShieldCheck,
    color: "green",
    text: "研发部权限策略已更新",
    detail: "策略校验通过 · 影响 24 位成员",
    time: "32 分钟前",
    type: "security",
    page: "permissions",
  },
  {
    icon: UploadCloud,
    color: "blue",
    text: "王晓上传了 6 份项目交付文档",
    detail: "项目资料 · 128 个分块已就绪",
    time: "1 小时前",
    type: "documents",
    page: "tasks",
  },
  {
    icon: CircleCheck,
    color: "green",
    text: "每周知识检索评测已完成",
    detail: "命中率 96.8% · 较上次提升 2.4%",
    time: "2 小时前",
    type: "evaluation",
    page: "evaluation",
  },
];

function TrendChart({ range }: { range: "week" | "month" }) {
  const [selected, setSelected] = useState<number | null>(null);
  const queries =
    range === "week"
      ? [820, 1080, 940, 1380, 1210, 1540, 1724]
      : [3080, 4260, 3940, 5380, 4810, 6340, 7240];
  const labels =
    range === "week"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["10/07", "10/12", "10/17", "10/22", "10/27", "11/01", "11/06"];
  const primary =
    range === "week"
      ? "M46 142 C82 142 104 94 150 103 S211 143 254 121 S314 43 358 58 S424 98 462 82 S529 39 566 43 S629 24 670 20"
      : "M46 157 C87 157 104 99 150 111 S207 144 254 130 S314 62 358 76 S422 112 462 97 S528 39 566 44 S631 15 670 20";
  const secondary =
    range === "week"
      ? "M46 174 C89 174 106 146 150 152 S211 175 254 157 S315 104 358 116 S420 145 462 133 S528 90 566 100 S628 66 670 72"
      : "M46 182 C89 182 106 152 150 160 S211 182 254 165 S315 120 358 132 S420 158 462 149 S528 109 566 116 S628 76 670 83";
  const pointYs =
    range === "week"
      ? [142, 103, 121, 58, 82, 43, 20]
      : [157, 111, 130, 76, 97, 44, 20];
  return (
    <div className="ov-chart">
      <svg
        viewBox="0 0 704 238"
        role="img"
        aria-label={`${range === "week" ? "本周" : "近30天"}问答量和检索量趋势，演示数据`}
      >
        <defs>
          <linearGradient id="ov-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8c70ef" stopOpacity=".17" />
            <stop offset="100%" stopColor="#8c70ef" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 65, 110, 155, 200].map((y, i) => (
          <g key={y}>
            <line
              x1="46"
              x2="680"
              y1={y}
              y2={y}
              stroke="#eeedf4"
              strokeDasharray="4 5"
            />
            <text x="31" y={y + 4} textAnchor="end">
              {range === "week"
                ? [1800, 1350, 900, 450, 0][i]
                : [8000, 6000, 4000, 2000, 0][i]}
            </text>
          </g>
        ))}
        <path d={`${primary} L670 200 L46 200 Z`} fill="url(#ov-fill)" />
        <path
          d={secondary}
          fill="none"
          stroke="#b9b0d8"
          strokeWidth="2.5"
          strokeDasharray="5 5"
        />
        <path
          d={primary}
          fill="none"
          stroke="#7958e8"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {labels.map((label, i) => (
          <g
            key={label}
            onMouseEnter={() => setSelected(i)}
            onMouseLeave={() => setSelected(null)}
          >
            <text x={46 + i * 104} y="227" textAnchor="middle">
              {label}
            </text>
            <circle
              cx={46 + i * 104}
              cy={pointYs[i]}
              r="12"
              fill="transparent"
            />
            <circle
              cx={46 + i * 104}
              cy={pointYs[i]}
              r={selected === i ? "5" : "3.5"}
              fill="#fff"
              stroke="#7958e8"
              strokeWidth="2"
            />
            {selected === i && (
              <g>
                <rect
                  x={Math.min(46 + i * 104 - 38, 602)}
                  y={Math.max(pointYs[i] - 39, 1)}
                  width="76"
                  height="25"
                  rx="6"
                  fill="#2c2540"
                />
                <text
                  x={Math.min(46 + i * 104, 640)}
                  y={Math.max(pointYs[i] - 22, 18)}
                  textAnchor="middle"
                  className="ov-chart-tooltip"
                >
                  {queries[i].toLocaleString()} 次
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function OverviewPage({ onNavigate }: OverviewProps) {
  const [range, setRange] = useState<"week" | "month">("week");
  const [activityFilter, setActivityFilter] = useState("all");
  const date = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return (
    <div className="page-content ov-page">
      <PageHeader
        title="每一份知识，都在创造价值"
        description="从知识沉淀到可信问答，在这里看见团队知识的流动。"
        action={
          <div className="ov-date">
            <CalendarDays size={15} />
            {date}
            <Badge tone="neutral">演示数据</Badge>
          </div>
        }
      />

      <div className="ov-welcome">
        <div className="ov-welcome-copy">
          <span className="ov-eyebrow">
            <Sparkles size={15} /> 让经验成为团队的共同资产
          </span>
          <h2>你好，张三。今天想探索什么？</h2>
          <p>连接散落的文档，让每一个问题，都有据可依。</p>
          <button
            className="btn btn-primary"
            onClick={() => onNavigate("chat")}
          >
            开始知识问答 <ArrowRight size={16} />
          </button>
        </div>
        <div className="ov-knowledge-map" aria-hidden="true">
          <div className="ov-map-orbit ov-map-orbit-outer" />
          <div className="ov-map-orbit ov-map-orbit-inner" />
          <span className="ov-map-node ov-map-node-one">
            <FileText size={22} />
          </span>
          <span className="ov-map-node ov-map-node-two">
            <ShieldCheck size={22} />
          </span>
          <span className="ov-map-node ov-map-node-three">
            <MessageSquareText size={22} />
          </span>
          <span className="ov-map-node ov-map-node-four">
            <GitBranch size={20} />
          </span>
          <div className="ov-map-center">
            <Layers3 size={42} strokeWidth={1.5} />
          </div>
          <span className="ov-map-dot ov-map-dot-one" />
          <span className="ov-map-dot ov-map-dot-two" />
        </div>
        <div className="ov-welcome-status">
          <span className="ov-live-dot" /> 知识连接，一切就绪
        </div>
      </div>

      <div className="stats-grid ov-stats">
        <StatCard
          label="知识文档"
          value="2,846"
          icon={<FileText size={19} />}
          trend="↑ 128"
          detail="较上周新增"
        />
        <StatCard
          label="知识分块"
          value="12,864"
          icon={<Database size={19} />}
          trend="↑ 642"
          detail="可检索片段"
        />
        <StatCard
          label="检索命中率"
          value={
            <>
              96.8<span className="ov-value-unit">%</span>
            </>
          }
          icon={<Search size={19} />}
          trend="↑ 2.4%"
          detail="较上周提升"
        />
        <StatCard
          label="平均回答耗时"
          value={
            <>
              1.2<span className="ov-value-unit">s</span>
            </>
          }
          icon={<Zap size={19} />}
          trend="↓ 0.3s"
          detail="较上周优化"
        />
      </div>

      <div className="ov-main-grid">
        <section className="panel ov-trend-panel">
          <div className="ov-panel-heading">
            <div>
              <h3>知识使用趋势</h3>
              <p>每一次提问，都是知识价值的延伸</p>
            </div>
            <div className="ov-segment" aria-label="趋势时间范围">
              <button
                className={range === "week" ? "active" : ""}
                onClick={() => setRange("week")}
              >
                近 7 天
              </button>
              <button
                className={range === "month" ? "active" : ""}
                onClick={() => setRange("month")}
              >
                近 30 天
              </button>
            </div>
          </div>
          <div className="ov-chart-summary">
            <strong>
              {range === "week" ? "8,694" : "35,050"}
              <span>次知识问答</span>
            </strong>
            <span className="ov-growth">
              <ArrowUpRight size={14} />
              {range === "week" ? "18.6%" : "23.8%"} <span>较上一周期</span>
            </span>
            <div className="ov-legend">
              <span>
                <i />
                问答量
              </span>
              <span>
                <i />
                检索量
              </span>
            </div>
          </div>
          <TrendChart key={range} range={range} />
          <div className="ov-chart-footer">
            <span>
              <CircleCheck size={14} /> 当前周期问答成功率 99.2%
            </span>
            <button onClick={() => onNavigate("evaluation")}>
              查看质量评测 <ArrowRight size={14} />
            </button>
          </div>
        </section>

        <section className="panel ov-popular-panel">
          <div className="ov-panel-heading">
            <div>
              <h3>热门知识</h3>
              <p>本周被引用最多的文档</p>
            </div>
            <button
              className="ov-text-link"
              onClick={() => onNavigate("documents")}
              aria-label="查看全部热门文档"
            >
              <ArrowUpRight size={19} />
            </button>
          </div>
          <div className="ov-popular-list">
            {popular.map((doc, index) => (
              <button
                key={doc.title}
                className="ov-popular-row"
                onClick={() => onNavigate("documents")}
              >
                <span className="ov-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={`ov-file-icon ov-file-${doc.color}`}>
                  <FileText size={19} />
                  <small>{doc.extension}</small>
                </span>
                <span className="ov-popular-info">
                  <strong>{doc.title}</strong>
                  <span>
                    {doc.category}
                    <span>{doc.count} 次引用</span>
                  </span>
                  <span className="ov-popular-track">
                    <i style={{ width: `${doc.progress}%` }} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button
            className="ov-all-docs"
            onClick={() => onNavigate("knowledge")}
          >
            <BookOpen size={16} /> 探索全部知识库 <ChevronRight size={16} />
          </button>
        </section>

        <section className="panel ov-pipeline-panel">
          <div className="ov-panel-heading">
            <div>
              <h3>让知识可信、可用</h3>
              <p>企业知识的完整生命周期</p>
            </div>
            <Badge tone="success">
              <span className="ov-small-dot" /> 示例流程
            </Badge>
          </div>
          <div className="ov-pipeline">
            {[
              {
                icon: FolderOpen,
                title: "知识沉淀",
                description: "统一管理，持续积累",
                value: "4 个业务知识库",
                page: "knowledge",
                tone: "purple",
                label: "管理知识库",
              },
              {
                icon: Search,
                title: "智能检索",
                description: "精准召回，有据可依",
                value: "混合检索 + 引用溯源",
                page: "retrieval",
                tone: "blue",
                label: "检索实验室",
              },
              {
                icon: ShieldCheck,
                title: "安全治理",
                description: "权限隔离，全程留痕",
                value: "24 位团队成员",
                page: "permissions",
                tone: "green",
                label: "配置权限",
              },
            ].map((step, index) => (
              <div className="ov-pipeline-step" key={step.title}>
                <span className={`ov-step-icon ov-tone-${step.tone}`}>
                  <step.icon size={22} />
                </span>
                <div className="ov-step-kicker">0{index + 1}</div>
                <h4>{step.title}</h4>
                <p>{step.description}</p>
                <span className="ov-step-value">
                  <Check size={13} />
                  {step.value}
                </span>
                <button onClick={() => onNavigate(step.page)}>
                  {step.label}
                  <ArrowRight size={14} />
                </button>
                {index < 2 && (
                  <ChevronRight className="ov-step-arrow" size={18} />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="panel ov-activity-panel">
          <div className="ov-panel-heading">
            <div>
              <h3>团队动态</h3>
              <p>知识成长的每一步，都有记录</p>
            </div>
            <select
              className="ov-activity-select"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              aria-label="筛选团队动态"
            >
              <option value="all">全部动态</option>
              <option value="documents">文档动态</option>
              <option value="security">安全动态</option>
            </select>
          </div>
          <div className="ov-activity-list">
            {activity
              .filter(
                (item) =>
                  activityFilter === "all" || item.type === activityFilter,
              )
              .map((item) => (
                <button
                  className="ov-activity-row"
                  key={item.text}
                  onClick={() => onNavigate(item.page)}
                >
                  <span className={`ov-activity-icon ov-tone-${item.color}`}>
                    <item.icon size={16} />
                  </span>
                  <span className="ov-activity-copy">
                    <strong>{item.text}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <time>{item.time}</time>
                </button>
              ))}
          </div>
          <button className="ov-all-docs" onClick={() => onNavigate("audit")}>
            <Clock3 size={15} /> 查看完整审计记录 <ChevronRight size={16} />
          </button>
        </section>
      </div>

      <div className="ov-bottom-actions">
        <div>
          <span className="ov-bottom-icon">
            <Users size={20} />
          </span>
          <div>
            <strong>让团队的下一位成员，更快找到答案。</strong>
            <span>沉淀一份文档，分享一份经验。</span>
          </div>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => onNavigate("documents")}
        >
          <ArrowDownToLine size={16} /> 导入知识
        </button>
      </div>
    </div>
  );
}
