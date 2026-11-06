import {
  Check,
  CheckCircle2,
  Database,
  KeyRound,
  Layers3,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { CapabilityNote as DemoNote } from "../components/CapabilityNote";
import { RequestStatus } from "../components/RequestStatus";
import { Badge, Modal, PageHeader, StatCard, useToast } from "../components/ui";
import type { KnowledgeVersion } from "../features/knowledge/types";
import {
  departments as permissionDepts,
  resources as permissionResources,
  roles as permissionRoles,
} from "../features/permissions/data";
import { usePermissions } from "../features/permissions/usePermissions";
import { useAction } from "../hooks/useAction";
import "./governance.css";
import { useAuth } from "../providers/AuthProvider";
import { AccessPage } from "./AccessPage";
type KnowledgeVersionAlias = KnowledgeVersion;

export function PermissionsPage() {
  return useAuth().mode === "local" ? (
    <AccessPage />
  ) : (
    <LegacyPermissionsPage />
  );
}
function LegacyPermissionsPage() {
  const notify = useToast();
  const {
    tab,
    setTab,
    members,
    rules,
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
    loading,
    error,
    reload,
  } = usePermissions();
  const { run, pending } = useAction();
  return (
    <div className="page-content gp-page">
      <RequestStatus loading={loading} error={error} reload={reload} />
      <PageHeader
        title="让每一份知识，都有清晰的边界"
        description="管理成员与授权配置。当前配置仅存储，尚未执行真实身份与访问控制。"
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
          value={permissionResources.length}
          detail="覆盖 4 个业务知识库"
          icon={<ShieldCheck size={19} />}
        />
        <StatCard
          label="租户隔离"
          value={<span className="gp-stat-word">未接入</span>}
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
                            disabled={pending}
                            onClick={() =>
                              void run(() => togglePermission(i, j))
                            }
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
                        disabled={pending}
                        onChange={(e) => {
                          const next = e.target.value;
                          void run(async () => {
                            await updateMemberRole(m, next);
                            notify("成员角色配置已保存", "success");
                          });
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
                        onClick={() =>
                          void run(async () => {
                            await removeMember(m);
                            notify("成员已移除", "success");
                          })
                        }
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
                <h3>目标权限链路（尚未接入）</h3>
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
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await addMember();
                notify("成员配置已保存", "success");
              });
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
