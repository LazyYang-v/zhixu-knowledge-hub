import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  Fingerprint,
  FlaskConical,
  Globe2,
  KeyRound,
  Layers3,
  LockKeyhole,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Modal,
  PageHeader,
  StatCard,
  useToast,
} from "../components/ui";
import { useLocalStorage } from "../lib/storage";
import type { RetrievalHit, RetrievalTrace } from "../lib/chat-data";
import "./governance.css";

import { apiFetch } from "../lib/api";
import { useKnowledgeDocuments } from "../features/knowledge/useKnowledge";
import { useTasks } from "../features/tasks/useTasks";
import { useRetrieval } from "../features/retrieval/useRetrieval";
import {
  searchDocs as searchDocsAlias,
  type SearchDoc,
} from "../features/retrieval/searchDocs";
import type { KnowledgeVersion } from "../features/knowledge/types";
import { usePermissions } from "../features/permissions/usePermissions";
import { departments as permissionDepts, roles as permissionRoles, resources as permissionResources } from "../features/permissions/data";
import type { Member } from "../features/permissions/types";
import { useAudit } from "../features/audit/useAudit";
import type { AuditLog } from "../features/audit/types";
import { useEvaluation } from "../features/evaluation/useEvaluation";
import type { EvaluationRun } from "../features/evaluation/types";
import { datasets, evalRows } from "../features/evaluation/data";
import { useSettings } from "../features/settings/useSettings";

type KnowledgeVersionAlias = KnowledgeVersion;
function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`gp-switch ${value ? "is-on" : ""}`}
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  );
}
function DemoNote({ children }: { children: string }) {
  return (
    <div className="gp-demo-note">
      <FlaskConical size={14} />
      {children}
    </div>
  );
}

export function PermissionsPage() {
  const notify = useToast();
  const {
    tab,
    setTab,
    members,
    setMembers,
    rules,
    setRules,
    adding,
    setAdding,
    name,
    setName,
    email,
    setEmail,
    memberDept,
    setMemberDept,
    memberRole,
    setMemberRole,
    department,
    setDepartment,
    role,
    setRole,
    getPermissions,
    togglePermission,
    addMember,
    updateMemberRole,
    removeMember,
  } = usePermissions();
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="让每一份知识，都有清晰的边界"
        description="从知识入库到答案生成，管理成员身份、访问范围与授权策略。"
        action={
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            添加成员
          </button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="组织成员"
          value={members.length}
          detail="当前工作空间"
          icon={<Users size={19} />}
        />
        <StatCard
          label="权限角色"
          value="3"
          detail="管理员 · 编辑者 · 普通成员"
          icon={<KeyRound size={19} />}
        />
        <StatCard
          label="知识库访问策略"
          value="16"
          detail="覆盖 4 个业务知识库"
          icon={<ShieldCheck size={19} />}
        />
        <StatCard
          label="租户隔离"
          value={<span className="gp-stat-word">独立空间</span>}
          detail="企业工作空间 · enterprise-001"
          icon={<Layers3 size={19} />}
        />
      </div>
      <div className="panel gp-panel">
        <div className="tabs gp-tabbar">
          {["权限策略", "组织成员", "校验链路"].map((t) => (
            <button
              className={`tab ${tab === t ? "active" : ""}`}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
          <Badge tone="purple">演示工作空间</Badge>
        </div>
        {tab === "权限策略" && (
          <>
            <div className="gp-panel-heading">
              <div>
                <h3>知识库权限矩阵</h3>
                <p>选择部门与角色，配置可访问的知识及操作范围。</p>
              </div>
              <div className="gp-inline">
                <select
                  className="select"
                  aria-label="选择部门"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  {permissionDepts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
                <select
                  className="select"
                  aria-label="选择角色"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {permissionRoles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table gp-permission-table">
                <thead>
                  <tr>
                    <th>资源范围</th>
                    {["检索与阅读", "上传与编辑", "发布与归档", "权限管理"].map(
                      (t) => (
                        <th key={t}>{t}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {permissionResources.map((r, i) => (
                    <tr key={r}>
                      <td>
                        <span className="gp-resource">
                          <Database size={17} />
                          {r}
                        </span>
                        <small>
                          enterprise-001 /{" "}
                          {["policy", "engineering", "projects", "faq"][i]}
                        </small>
                      </td>
                      {getPermissions(i).map((enabled, j) => (
                        <td key={j}>
                          <button
                            className={`gp-permission ${enabled ? "granted" : ""}`}
                            aria-label={`${r} ${["检索与阅读", "上传与编辑", "发布与归档", "权限管理"][j]}`}
                            aria-pressed={enabled}
                            onClick={() => togglePermission(i, j)}
                          >
                            {enabled ? <Check size={16} /> : <span>—</span>}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DemoNote>
              权限变更仅用于交互演示；实际访问控制需由服务端在检索前后执行。
            </DemoNote>
          </>
        )}
        {tab === "组织成员" && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>所属部门</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.email}>
                    <td>
                      <span className="gp-member">
                        <span className="gp-avatar">{m.name.slice(-1)}</span>
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>{m.department}</td>
                    <td>
                      <select
                        aria-label={`${m.name}的角色`}
                        className="select gp-table-select"
                        value={m.role}
                        onChange={(e) => {
                          apiFetch(
                            `/api/permissions/members/${m.id ?? ""}`,
                            {
                              method: "PUT",
                              body: JSON.stringify({ role: e.target.value }),
                            },
                          );
                          setMembers(
                            members.map((item, n) =>
                              n === i
                                ? { ...item, role: e.target.value }
                                : item,
                            ),
                          );
                          notify("成员角色已更新");
                        }}
                      >
                                {permissionRoles.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Badge tone="success">正常</Badge>
                    </td>
                    <td>
                      <button
                        className="gp-text-button"
                        disabled={i === 0}
                        onClick={() => {
                          apiFetch(`/api/permissions/members/${m.id ?? ""}`, {
                            method: "DELETE",
                          });
                          setMembers(members.filter((_, n) => n !== i));
                          notify("成员已从演示工作空间移除");
                        }}
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === "校验链路" && (
          <div className="gp-validation">
            <div className="gp-safe-heading">
              <ShieldCheck size={32} />
              <div>
                <h3>权限贯穿整个检索链路</h3>
                <p>任何进入模型上下文的证据，都必须经过两次授权校验。</p>
              </div>
            </div>
            {[
              {
                title: "入库时注入 ACL 元数据",
                text: "每个知识分块继承所属租户、部门、角色与密级。",
                meta: "tenant: enterprise-001 · department: 研发部 · clearance: internal",
              },
              {
                title: "查询时附带用户身份",
                text: "绑定当前用户与组织身份，解析授权范围。",
                meta: "user: zhangsan · role: member · tenant: enterprise-001",
              },
              {
                title: "检索前权限过滤",
                text: "先过滤不可访问的文档集合，再执行混合召回。",
                meta: "ACL filter → BM25 + Dense Vector → Rerank",
              },
              {
                title: "召回后二次授权校验",
                text: "重新核验实时权限，避免索引延迟造成越权。",
                meta: "Realtime ACL → Verified evidence → Model context",
              },
            ].map((s, i) => (
              <div className="gp-validation-step" key={s.title}>
                <span>{i + 1}</span>
                <div>
                  <h4>{s.title}</h4>
                  <p>{s.text}</p>
                  <code>{s.meta}</code>
                </div>
                <CheckCircle2 size={19} />
              </div>
            ))}
            <DemoNote>
              此处展示授权链路设计，不执行真实身份认证或安全校验。
            </DemoNote>
          </div>
        )}
      </div>
      {adding && (
        <Modal title="添加工作空间成员" onClose={() => setAdding(false)}>
          <form
            className="gp-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || !email.trim()) return;
              if (members.some((m) => m.email === email.trim())) {
                notify("该邮箱已在工作空间中");
                return;
              }
              const member: Member = {
                name: name.trim(),
                email: email.trim(),
                department: memberDept,
                role: memberRole,
              };
              const data = await apiFetch<{ member: Member }>(
                "/api/permissions/members",
                { method: "POST", body: JSON.stringify(member) },
              );
              setMembers((current) => [
                ...current,
                data?.member ?? { ...member, id: crypto.randomUUID() },
              ]);
              setAdding(false);
              setName("");
              setEmail("");
              notify("成员已添加至本地演示工作空间");
            }}
          >
            <label className="field">
              成员姓名
              <input
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入姓名"
              />
            </label>
            <label className="field">
              企业邮箱
              <input
                className="input"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </label>
            <div className="gp-form-row">
              <label className="field">
                所属部门
                <select
                  className="select"
                  value={memberDept}
                  onChange={(e) => setMemberDept(e.target.value)}
                >
                  {permissionDepts.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                权限角色
                <select
                  className="select"
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                >
                  {permissionRoles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
            <DemoNote>此操作仅添加本地成员记录，不会发送邀请邮件。</DemoNote>
            <div className="gp-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAdding(false)}
              >
                取消
              </button>
              <button className="btn btn-primary" type="submit">
                添加成员
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function AuditPage() {
  const notify = useToast();
  const {
    query,
    setQuery,
    filter,
    setFilter,
    status,
    setStatus,
    selected,
    setSelected,
    filtered,
  } = useAudit();
  const exportLogs = () => {
    const rows = [
      ["审计 ID", "时间", "用户", "部门", "操作", "内容", "结果"],
      ...filtered.map((l) => [
        l.id,
        `2026-11-06 ${l.time}`,
        l.user,
        l.department,
        l.action,
        l.content,
        l.status,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\uFEFF" +
            rows
              .map((r) =>
                r.map((c) => `"${c.replaceAll('"', '""')}"`).join(","),
              )
              .join("\n"),
        ],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "审计日志-2026-11-06.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify(`已导出 ${filtered.length} 条审计记录`);
  };
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="每一次知识访问，都有迹可循"
        description="追溯查询、证据与操作的完整路径，让知识使用透明、可审计。"
        action={
          <button className="btn btn-secondary" onClick={exportLogs}>
            <ArrowDownToLine size={16} />
            导出日志
          </button>
        }
      />
      <div className="stats-grid">
        <StatCard
          label="今日操作"
          value="1,248"
          trend="↑ 12.6%"
          detail="较昨日"
          icon={<Activity size={18} />}
        />
        <StatCard
          label="知识问答"
          value="856"
          detail="占全部操作 68.6%"
          icon={<Sparkles size={18} />}
        />
        <StatCard
          label="授权通过率"
          value="99.8%"
          detail="基于示例审计数据"
          icon={<ShieldCheck size={18} />}
        />
        <StatCard
          label="越权请求拦截"
          value="3"
          detail="已阻止进入模型上下文"
          icon={<LockKeyhole size={18} />}
        />
      </div>
      <div className="panel gp-panel">
        <div className="gp-toolbar">
          <div className="gp-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索用户、操作内容或审计 ID"
              aria-label="搜索审计日志"
            />
          </div>
          <select
            className="select"
            aria-label="操作类型"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "全部操作",
              "智能问答",
              "检索请求",
              "文档发布",
              "文档上传",
              "权限变更",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <select
            className="select"
            aria-label="审计结果"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["全部状态", "通过", "已拦截"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table className="data-table gp-audit-table">
            <thead>
              <tr>
                <th>时间 / 审计 ID</th>
                <th>操作人</th>
                <th>操作类型</th>
                <th>操作内容</th>
                <th>结果</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td>
                    <strong>{log.time}</strong>
                    <small>{log.id}</small>
                  </td>
                  <td>
                    {log.user}
                    <small>{log.department}</small>
                  </td>
                  <td>
                    <Badge>{log.action}</Badge>
                  </td>
                  <td>
                    {log.content}
                    <small>{log.source}</small>
                  </td>
                  <td>
                    <Badge tone={log.status === "通过" ? "success" : "danger"}>
                      {log.status}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="gp-text-button"
                      onClick={() => setSelected(log)}
                    >
                      详情
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <EmptyState
              title="没有匹配的审计记录"
              description="尝试其他关键词或调整筛选条件。"
            />
          )}
        </div>
        <div className="gp-table-footer">
          <span>共 {filtered.length} 条记录</span>
          <span>2026 年 11 月 6 日 · 演示数据</span>
        </div>
      </div>
      {selected && (
        <Modal title="审计记录详情" wide onClose={() => setSelected(null)}>
          <div className="gp-detail-top">
            <Badge tone={selected.status === "通过" ? "success" : "danger"}>
              {selected.status === "通过" ? "授权校验通过" : "访问被拦截"}
            </Badge>
            <code>{selected.id}</code>
          </div>
          <dl className="gp-detail-grid">
            <div>
              <dt>操作人</dt>
              <dd>
                {selected.user} · {selected.department}
              </dd>
            </div>
            <div>
              <dt>操作时间</dt>
              <dd>2026-11-06 {selected.time}</dd>
            </div>
            <div>
              <dt>租户身份</dt>
              <dd>enterprise-001</dd>
            </div>
            <div>
              <dt>操作类型</dt>
              <dd>{selected.action}</dd>
            </div>
          </dl>
          <h4>请求内容</h4>
          <div className="gp-query-box">{selected.content}</div>
          <h4>
            {selected.action === "智能问答"
              ? "进入模型上下文的证据"
              : "关联资源"}
          </h4>
          {selected.docs.length ? (
            <div className="gp-evidence-list">
              {selected.docs.map((d) => (
                <div key={d}>
                  <FileText size={18} />
                  <span>{d}</span>
                  <ShieldCheck size={16} />
                </div>
              ))}
            </div>
          ) : (
            <div className="gp-blocked">
              <LockKeyhole size={18} />
              请求在权限预过滤阶段被拦截。无文档被召回，无证据进入模型上下文。
            </div>
          )}
          <div className="gp-trace">
            <span>
              <CheckCircle2 size={15} />
              身份解析
            </span>
            <ArrowRight size={14} />
            <span>
              <CheckCircle2 size={15} />
              租户隔离
            </span>
            <ArrowRight size={14} />
            <span>
              {selected.status === "通过" ? (
                <CheckCircle2 size={15} />
              ) : (
                <X size={15} />
              )}
              ACL 校验
            </span>
            {selected.status === "通过" && (
              <>
                <ArrowRight size={14} />
                <span>
                  <CheckCircle2 size={15} />
                  证据留痕
                </span>
              </>
            )}
          </div>
          <DemoNote>此详情来自内置审计样本，展示可追溯的事件结构。</DemoNote>
        </Modal>
      )}
    </div>
  );
}

export function EvaluationPage() {
  const notify = useToast();
  const {
    dataset,
    setDataset,
    running,
    progress,
    start,
    runs,
    latest,
    hit,
    accuracy,
    latency,
    samples,
    selected,
    setSelected,
    datasets: evaluationDatasets,
  } = useEvaluation();
  useEffect(() => {
    if (running || progress !== 100) return;
    notify(
      latest
        ? "评测已完成，指标基于服务端真实检索结果计算"
        : "模拟评测已完成，报告已更新",
    );
  }, [running, progress, latest, notify]);
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="用数据，看见每一次回答的进步"
        description="持续衡量检索质量与问答表现，让优化有依据、效果可验证。"
        action={
          <div className="gp-inline">
            <select
              className="select"
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              aria-label="评测数据集"
              disabled={running}
            >
              {evaluationDatasets.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={running}
              onClick={start}
            >
              <Play size={15} />
              {running ? `评测中 ${progress}%` : "运行评测"}
            </button>
          </div>
        }
      />
      {running && (
        <div
          className="gp-run-progress"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="stats-grid">
        <StatCard
          label="检索命中率 · Hit@5"
          value={`${hit}%`}
          detail="200 条标注问题"
          trend="↑ 2.4%"
          icon={<Search size={18} />}
        />
        <StatCard
          label="回答准确率"
          value={`${accuracy}%`}
          detail="基于参考答案评分"
          trend="↑ 1.8%"
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="平均响应延迟"
          value={
            <span>
              {latency}
              <span className="gp-unit">s</span>
            </span>
          }
          detail="P95 延迟 2.18s"
          trend="↓ 0.16s"
          icon={<Clock3 size={18} />}
        />
        <StatCard
          label="ROUGE-L / BLEU"
          value={
            <span className="gp-metric-pair">
              0.86 <i>/</i> 0.78
            </span>
          }
          detail="文本相似度辅助指标"
          icon={<BarChart3 size={18} />}
        />
      </div>
      <div className="gp-eval-grid">
        <section className="panel gp-chart-panel">
          <div className="gp-panel-heading">
            <div>
              <h3>检索质量趋势</h3>
              <p>近 7 次评测 · {dataset}</p>
            </div>
            <div className="gp-chart-legend">
              <span>
                <i />
                命中率
              </span>
              <span>
                <i />
                准确率
              </span>
            </div>
          </div>
          <svg
            className="gp-chart"
            viewBox="0 0 640 225"
            role="img"
            aria-label="近七次评测命中率从 90% 上升到 96.8%，准确率从 87% 上升到 94.2%"
          >
            <defs>
              <linearGradient
                id="gp-chart-gradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#8261ef" stopOpacity=".17" />
                <stop offset="100%" stopColor="#8261ef" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[40, 90, 140, 190].map((y, i) => (
              <g key={y}>
                <line
                  x1="46"
                  x2="620"
                  y1={y}
                  y2={y}
                  stroke="#ececf3"
                  strokeDasharray="4 5"
                />
                <text x="4" y={y + 4} fill="#9b9bab" fontSize="11">
                  {100 - i * 5}%
                </text>
              </g>
            ))}
            <path
              d="M55 141 C90 142 117 122 146 118 S216 121 239 100 S302 100 332 82 S390 93 425 67 S492 70 518 54 S587 53 612 43 L612 191 L55 191Z"
              fill="url(#gp-chart-gradient)"
            />
            <path
              d="M55 141 C90 142 117 122 146 118 S216 121 239 100 S302 100 332 82 S390 93 425 67 S492 70 518 54 S587 53 612 43"
              stroke="#7957e8"
              strokeWidth="3"
              fill="none"
            />
            <path
              d="M55 171 C93 168 115 155 146 152 S211 154 239 139 S301 142 332 120 S391 125 425 103 S491 107 518 85 S584 85 612 72"
              stroke="#45b6aa"
              strokeWidth="2.5"
              fill="none"
            />
            {[
              "10/25",
              "10/27",
              "10/29",
              "10/31",
              "11/02",
              "11/04",
              "11/06",
            ].map((d, i) => (
              <text
                key={d}
                x={55 + i * 92.8}
                y="217"
                textAnchor="middle"
                fontSize="11"
                fill="#9b9bab"
              >
                {d}
              </text>
            ))}
            <circle
              cx="612"
              cy="43"
              r="5"
              fill="#7957e8"
              stroke="white"
              strokeWidth="2"
            />
            <circle
              cx="612"
              cy="72"
              r="4"
              fill="#45b6aa"
              stroke="white"
              strokeWidth="2"
            />
          </svg>
        </section>
        <section className="panel gp-config-summary">
          <h3>本次评测配置</h3>
          <dl>
            <div>
              <dt>数据集规模</dt>
              <dd>200 条问题</dd>
            </div>
            <div>
              <dt>召回策略</dt>
              <dd>混合检索 + Rerank</dd>
            </div>
            <div>
              <dt>Top K</dt>
              <dd>5</dd>
            </div>
            <div>
              <dt>Embedding</dt>
              <dd>bge-m3</dd>
            </div>
            <div>
              <dt>重排模型</dt>
              <dd>bge-reranker-v2-m3</dd>
            </div>
            <div>
              <dt>评测状态</dt>
              <dd>
                <Badge tone={running ? "purple" : "success"}>
                  {running ? "运行中" : "已完成"}
                </Badge>
              </dd>
            </div>
          </dl>
          <DemoNote>
            {runs ? `已完成 ${runs} 次模拟评测` : "所有指标均为演示数据"}
          </DemoNote>
        </section>
      </div>
      <section className="panel gp-panel">
        <div className="gp-panel-heading">
          <div>
            <h3>评测样本明细</h3>
            <p>从具体问题追溯召回质量与答案表现</p>
          </div>
          <Badge>示例样本 4 / 200</Badge>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>评测问题</th>
                <th>预期引用文档</th>
                <th>相关性</th>
                <th>结果</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {samples.map((row) => (
                <tr key={row[0]}>
                  <td>{row[0]}</td>
                  <td className="muted">{row[1]}</td>
                  <td>
                    <span className="gp-score">{row[2]}</span>
                  </td>
                  <td>
                    <Badge tone={row[3] === "通过" ? "success" : "warning"}>
                      {row[3]}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="gp-text-button"
                      onClick={() => setSelected(row)}
                    >
                      查看
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <Modal title="评测样本详情" onClose={() => setSelected(null)}>
          <div className="gp-query-box">{selected[0]}</div>
          <dl className="gp-detail-grid">
            <div>
              <dt>参考文档</dt>
              <dd>{selected[1]}</dd>
            </div>
            <div>
              <dt>相关性得分</dt>
              <dd>{selected[2]}</dd>
            </div>
          </dl>
          <h4>评测结论</h4>
          <p className="gp-readable">
            {selected[3] === "通过"
              ? "命中正确的参考文档，答案与证据一致，引用位置可追溯。该样本通过检索相关性与答案忠实度检查。"
              : "已命中参考文档，但回答遗漏了参考答案中的时效或审批条件。建议补充相关分块、调整召回范围后重新评测。"}
          </p>
          <DemoNote>这是内置评测样本的分析结果。</DemoNote>
        </Modal>
      )}
    </div>
  );
}

export function RetrievalPage() {
  const {
    query,
    setQuery,
    searched,
    strategy,
    setStrategy,
    scope,
    setScope,
    threshold,
    setThreshold,
    topK,
    setTopK,
    running,
    results,
    elapsed,
    scoreKey,
    runSearch,
  } = useRetrieval();
  const [detail, setDetail] = useState<RetrievalHit | SearchDoc | null>(null);
  const found = searchDocsAlias
    .filter(
      (d) =>
        (scope === "全部知识库" || d.scope === scope) &&
        d.tags.some((t) => searched.includes(t)) &&
        Number(d[scoreKey]) >= threshold,
    )
    .sort(
      (a, b) =>
        Number(b[scoreKey as "bm25" | "dense" | "rerank"]) -
        Number(a[scoreKey as "bm25" | "dense" | "rerank"]),
    )
    .slice(0, topK);
  const visibleResults = (results ?? found) as Array<
    RetrievalHit | SearchDoc
  >;
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="让每一次检索，都能被理解"
        description="对比召回策略、调节检索参数，找到知识与问题之间最准确的连接。"
        action={
          <Badge tone="purple">
            <FlaskConical size={13} />
            检索实验室
          </Badge>
        }
      />
      <div className="gp-retrieval-layout">
        <div>
          <section className="panel gp-retrieval-query">
            <div className="gp-section-eyebrow">
              <Search size={16} />
              测试问题
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="检索问题"
                placeholder="输入一个问题，观察知识是如何被找到的…"
                required
              />
              <div>
                <span>当前身份：张三 · 研发部</span>
                <button
                  className="btn btn-primary"
                  disabled={running || !query.trim()}
                  type="submit"
                >
                  <Search size={16} />
                  {running ? "正在检索…" : "开始检索"}
                </button>
              </div>
            </form>
          </section>
          <section className="panel gp-panel gp-results">
            <div className="tabs gp-tabbar">
              {["混合检索", "BM25", "向量检索"].map((s) => (
                <button
                  key={s}
                  className={`tab ${strategy === s ? "active" : ""}`}
                  onClick={() => {
                    setStrategy(s);
                    if (results !== null) void runSearch({ strategy: s });
                  }}
                >
                  {s}
                </button>
              ))}
              <span className="gp-result-count">
                {visibleResults.length} 个相关分块
              </span>
            </div>
            <div className="gp-results-summary">
              <span>
                <CheckCircle2 size={14} />
                已应用权限预过滤
              </span>
              <span>
                {running
                  ? "检索中…"
                  : elapsed !== null
                    ? `耗时 ${elapsed} ms · 服务端结果`
                    : "耗时 286 ms · 演示结果"}
              </span>
            </div>
            {visibleResults.length ? (
              visibleResults.map((doc, i) => (
                <button
                  className="gp-result-card"
                  key={`${doc.title}-${i}`}
                  onClick={() => setDetail(doc)}
                >
                  <div className="gp-result-title">
                    <span className="gp-rank">{i + 1}</span>
                    <FileText size={18} />
                    <strong>{doc.title}</strong>
                    <span className="gp-score-pill">
                      {Number(doc[scoreKey]).toFixed(2)}
                    </span>
                  </div>
                  <p>{doc.content}</p>
                  <div className="gp-result-meta">
                    <span>{doc.section}</span>
                    <span>{doc.page}</span>
                    <span>
                      <ShieldCheck size={13} />
                      已授权
                    </span>
                  </div>
                  <div className="gp-scorebar">
                    <div
                      style={{
                        width: `${Number(doc[scoreKey]) * 100}%`,
                      }}
                    />
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="未找到符合条件的知识"
                description="试试“年假”“报销”“入职”或“项目归档”，也可以切换知识范围或降低相关性阈值。"
              />
            )}
          </section>
        </div>
        <aside className="panel gp-retrieval-settings">
          <div className="gp-section-eyebrow">
            <SlidersHorizontal size={17} />
            检索参数
          </div>
          <label className="field">
            知识范围
            <select
              className="select"
              aria-label="检索知识范围"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {["全部知识库", "企业制度", "项目资料"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            召回数量 Top K
            <span className="gp-range-label">
              <span>1</span>
              <strong>{topK}</strong>
              <span>10</span>
            </span>
            <input
              type="range"
              min="1"
              max="10"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              aria-label="召回数量"
            />
          </label>
          <label className="field">
            相关性阈值
            <span className="gp-range-label">
              <span>0</span>
              <strong>{threshold.toFixed(2)}</strong>
              <span>1</span>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              aria-label="相关性阈值"
            />
          </label>
          <div className="gp-retrieval-stages">
            <h4>混合检索链路</h4>
            {[
              {
                icon: <Fingerprint size={16} />,
                name: "身份与权限预过滤",
                info: "先过滤，再召回",
              },
              {
                icon: <Search size={16} />,
                name: "BM25 + 向量召回",
                info: "关键词与语义双路召回",
              },
              {
                icon: <Layers3 size={16} />,
                name: "Rerank 精排",
                info: "bge-reranker-v2-m3",
              },
              {
                icon: <ShieldCheck size={16} />,
                name: "权限二次校验",
                info: "仅授权证据进入上下文",
              },
            ].map((s) => (
              <div key={s.name}>
                {s.icon}
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.info}</small>
                </span>
              </div>
            ))}
          </div>
          <DemoNote>演示使用内置文档关键词匹配，分数为预设值。</DemoNote>
        </aside>
      </div>
      {detail && (
        <Modal title="召回分块详情" onClose={() => setDetail(null)}>
          <div className="gp-inline">
            <FileText size={22} />
            <h3>{detail.title}</h3>
          </div>
          <p className="muted">
            {detail.section} · {detail.page}
          </p>
          <div className="gp-query-box gp-readable">{detail.content}</div>
          <div className="gp-three-scores">
            {[
              ["BM25", detail.bm25],
              ["向量相似度", detail.dense],
              ["Rerank", detail.rerank],
            ].map(([label, score]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{Number(score).toFixed(2)}</strong>
              </div>
            ))}
          </div>
          <DemoNote>
            分块元数据：tenant=enterprise-001，clearance=internal。
          </DemoNote>
        </Modal>
      )}
    </div>
  );
}

export function SettingsPage() {
  const notify = useToast();
  const {
    tab,
    setTab,
    integration,
    setIntegration,
    form,
    change,
    save: saveSettings,
  } = useSettings();
  const save = async () => {
    const result = await saveSettings();
    if (result === "empty") notify("请输入工作空间名称");
    else if (result === "range")
      notify("分块长度应为 64–4096，重叠长度应小于分块长度");
    else if (result === "server") notify("配置已保存到服务器");
    else if (result === "offline") notify("后端不可用，配置已保存至当前浏览器");
    else if (result === "no-storage")
      notify("浏览器存储不可用，配置仅在本次页面会话中生效");
  };
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="为团队，配置合适的知识体验"
        description="管理工作空间、知识处理策略与问答偏好。"
        action={
          <button className="btn btn-primary" onClick={save}>
            <Check size={16} />
            保存设置
          </button>
        }
      />
      <div className="panel gp-panel">
        <div className="tabs gp-tabbar">
          {["工作空间", "处理与检索", "问答偏好", "集成与安全"].map((t) => (
            <button
              key={t}
              className={`tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="gp-settings-content">
          {tab === "工作空间" && (
            <>
              <div className="gp-settings-section-title">
                <Globe2 size={22} />
                <div>
                  <h3>工作空间信息</h3>
                  <p>你的团队共享同一个知识空间。</p>
                </div>
              </div>
              <div className="gp-settings-form">
                <label className="field">
                  工作空间名称
                  <input
                    className="input"
                    value={form.workspace}
                    onChange={(e) => change("workspace", e.target.value)}
                    maxLength={50}
                  />
                </label>
                <label className="field">
                  租户标识
                  <input className="input" value={form.tenant} readOnly />
                  <small>租户标识用于知识隔离，在演示中不可修改。</small>
                </label>
                <div className="gp-setting-info">
                  <span className="gp-avatar">
                    <Layers3 size={21} />
                  </span>
                  <div>
                    <strong>Enterprise 工作空间</strong>
                    <p>4 个知识库 · 2,846 份文档 · 5,000 份文档容量</p>
                  </div>
                  <Badge tone="purple">演示版</Badge>
                </div>
              </div>
            </>
          )}
          {tab === "处理与检索" && (
            <>
              <div className="gp-settings-section-title">
                <Settings2 size={22} />
                <div>
                  <h3>知识处理与检索</h3>
                  <p>设置知识的分块方式，以及查询时的召回策略。</p>
                </div>
              </div>
              <div className="gp-settings-form">
                <div className="gp-form-row">
                  <label className="field">
                    Embedding 模型
                    <select
                      className="select"
                      value={form.embedding}
                      onChange={(e) => change("embedding", e.target.value)}
                    >
                      <option>bge-m3</option>
                      <option>text-embedding-3-small</option>
                      <option>bge-large-zh-v1.5</option>
                    </select>
                  </label>
                  <label className="field">
                    向量存储
                    <select
                      className="select"
                      value={form.vector}
                      onChange={(e) => change("vector", e.target.value)}
                    >
                      <option>pgvector</option>
                      <option>Milvus</option>
                      <option>FAISS</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  分块策略
                  <select
                    className="select"
                    value={form.strategy}
                    onChange={(e) => change("strategy", e.target.value)}
                  >
                    <option>父子分块</option>
                    <option>语义分块</option>
                    <option>固定长度</option>
                  </select>
                </label>
                <div className="gp-form-row">
                  <label className="field">
                    分块长度
                    <input
                      className="input"
                      type="number"
                      min="64"
                      max="4096"
                      value={form.chunkSize}
                      onChange={(e) => change("chunkSize", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    分块重叠长度
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="4095"
                      value={form.overlap}
                      onChange={(e) => change("overlap", e.target.value)}
                    />
                  </label>
                </div>
                <label className="field">
                  默认召回数量
                  <select
                    className="select"
                    value={form.topK}
                    onChange={(e) => change("topK", e.target.value)}
                  >
                    {["3", "5", "10", "20"].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <div className="gp-toggle-row">
                  <div>
                    <strong>启用 Rerank 精排</strong>
                    <p>对混合召回结果再次进行相关性排序。</p>
                  </div>
                  <Toggle
                    value={form.rerank}
                    label="启用 Rerank"
                    onChange={() => change("rerank", !form.rerank)}
                  />
                </div>
              </div>
            </>
          )}
          {tab === "问答偏好" && (
            <>
              <div className="gp-settings-section-title">
                <Sparkles size={22} />
                <div>
                  <h3>默认问答体验</h3>
                  <p>为工作空间成员配置一致的知识问答方式。</p>
                </div>
              </div>
              <div className="gp-settings-form">
                {(
                  [
                    {
                      key: "citations",
                      title: "默认展示引用来源",
                      description: "每个回答附上相关文档、版本与页码。",
                    },
                    {
                      key: "multiTurn",
                      title: "开启多轮会话",
                      description: "在后续提问中保留当前对话的上下文。",
                    },
                    {
                      key: "audit",
                      title: "启用问答审计记录",
                      description: "保留查询、召回文档和模型上下文的关联记录。",
                    },
                  ] as const
                ).map((item) => (
                  <div className="gp-toggle-row" key={item.key}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                    <Toggle
                      value={form[item.key]}
                      label={item.title}
                      onChange={() => change(item.key, !form[item.key])}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "集成与安全" && (
            <>
              <div className="gp-settings-section-title">
                <ShieldCheck size={22} />
                <div>
                  <h3>集成与安全方案</h3>
                  <p>连接现有基础设施，为企业知识建立安全边界。</p>
                </div>
              </div>
              <div className="gp-integrations">
                {[
                  {
                    title: "OIDC 单点登录",
                    icon: <Fingerprint size={24} />,
                    detail: "统一身份认证与企业账号登录",
                  },
                  {
                    title: "凭据加密",
                    icon: <KeyRound size={24} />,
                    detail: "AES-256-GCM 加密方案",
                  },
                  {
                    title: "网页抓取防护",
                    icon: <ShieldCheck size={24} />,
                    detail: "SSRF 防护与目标地址校验",
                  },
                ].map((item) => (
                  <button
                    className="gp-integration-card"
                    key={item.title}
                    onClick={() => setIntegration(item.title)}
                  >
                    {item.icon}
                    <h4>{item.title}</h4>
                    <p>{item.detail}</p>
                    <span>
                      查看方案
                      <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          <DemoNote>
            配置仅保存在本地浏览器；模型、向量库、身份认证等服务尚未连接。
          </DemoNote>
        </div>
      </div>
      {integration && (
        <Modal title={integration} onClose={() => setIntegration(null)}>
          <p className="gp-readable">
            {integration === "OIDC 单点登录"
              ? "生产环境应接入企业身份提供方，配置 Issuer、Client ID 与回调地址，并由服务端验证令牌签名、签发者、受众及有效期。当前前端不收集或保存真实登录凭据。"
              : integration === "凭据加密"
                ? "生产环境可使用 AES-256-GCM 对服务凭据进行加密，将密钥托管于密钥管理服务，支持密钥轮换与访问审计。当前演示不处理真实凭据。"
                : "生产环境网页导入应由服务端限制请求协议，拒绝访问内网、环回和云元数据地址，验证重定向后的目标，并设置超时和响应大小限制。当前前端不发起网页抓取。"}
          </p>
          <Badge tone="warning">待接入后端服务</Badge>
        </Modal>
      )}
    </div>
  );
}
