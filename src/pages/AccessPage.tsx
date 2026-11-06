import { useEffect, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { roleCapabilities } from "../../shared/auth";
import { useAuth } from "../providers/AuthProvider";
import { useResource } from "../hooks/useResource";
import { useAction } from "../hooks/useAction";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { apiFetch } from "../lib/api";
import { Badge, Modal, PageHeader, useToast } from "../components/ui";
import { Field } from "../components/ui/Field";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { RequestStatus } from "../components/RequestStatus";
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  revision: number;
};
type Grant = { baseId: string; memberId: string; permissions: string[] };
type Base = { id: string; name: string; revision: number };
const roles: Record<string, string> = {
  admin: "工作空间管理员",
  editor: "内容编辑者",
  viewer: "普通成员",
};
const permissions = ["read", "write", "publish", "manage"];
const labels: Record<string, string> = {
  read: "检索与阅读",
  write: "上传与编辑",
  publish: "发布与归档",
  manage: "库管理",
};

function MyAccess() {
  const { user } = useAuth();
  const bases = useResource<{ bases: Base[] }>("/api/knowledge/bases", {
    bases: [],
  });
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="我的访问权限"
        description="实际权限由角色能力与知识库授权共同决定。"
      />
      <RequestStatus {...bases} />
      <div className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>知识库</th>
              <th>当前授权</th>
            </tr>
          </thead>
          <tbody>
            {bases.data?.bases.map((base) => (
              <tr key={base.id}>
                <td>{base.name}</td>
                <td>
                  {(user?.grants[base.id] ?? [])
                    .filter((permission) =>
                      user?.capabilities.includes(permission),
                    )
                    .map((permission) => labels[permission])
                    .join("、") || "无有效权限"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {bases.data?.bases.length === 0 && !bases.loading && (
          <p className="access-heading">
            尚未获授知识库权限，请联系工作空间管理员。
          </p>
        )}
      </div>
    </div>
  );
}
function GrantMatrix({
  base,
  members,
  grants,
  onSaved,
  busy,
}: {
  base: Base;
  members: Member[];
  grants: Grant[];
  onSaved: () => void;
  busy: boolean;
}) {
  const [matrix, setMatrix] = useState<Record<string, string[]>>({}),
    [revision, setRevision] = useState(base.revision),
    [dirty, setDirty] = useState(false);
  const { run, pending } = useAction();
  const toast = useToast();
  useUnsavedChanges(dirty);
  useEffect(() => {
    if (!dirty) {
      setMatrix(
        Object.fromEntries(
          grants
            .filter((grant) => grant.baseId === base.id)
            .map((grant) => [grant.memberId, grant.permissions]),
        ),
      );
      setRevision(base.revision);
    }
  }, [base.id, base.revision, grants, dirty]);
  return (
    <div className="panel">
      <div className="access-heading">
        <div>
          <h3>{base.name}的成员授权</h3>
          <p>角色限定可用能力；管理员也需要明确的阅读授权。</p>
        </div>
        <div className="access-actions">
          <button
            className="btn btn-secondary"
            disabled={pending || busy}
            onClick={() => {
              if (
                dirty &&
                !window.confirm("重新载入会放弃未保存的授权修改，是否继续？")
              )
                return;
              setDirty(false);
              onSaved();
            }}
          >
            重新载入授权
          </button>
          {dirty && (
            <span className="access-status">
              {revision !== base.revision
                ? "服务端版本已变化，保存将检测冲突"
                : "有未保存的授权变更"}
            </span>
          )}
          <button
            className="btn btn-primary"
            disabled={!dirty || pending || busy}
            onClick={() =>
              void run(async () => {
                await apiFetch(
                  `/api/knowledge/bases/${encodeURIComponent(base.id)}/grants`,
                  {
                    method: "PUT",
                    body: JSON.stringify({
                      revision,
                      grants: Object.entries(matrix)
                        .filter(([, values]) => values.length)
                        .map(([memberId, values]) => ({
                          memberId,
                          permissions: values,
                        })),
                    }),
                  },
                );
                setDirty(false);
                onSaved();
                toast("知识库授权已保存", "success");
              })
            }
          >
            {pending ? "正在保存…" : "保存授权"}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>账户</th>
              {permissions.map((permission) => (
                <th key={permission}>{labels[permission]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members
              .filter((member) => member.status === "active")
              .map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <small className="access-status">
                      {" "}
                      · {roles[member.role]}
                    </small>
                  </td>
                  {permissions.map((permission) => {
                    const checked =
                      matrix[member.id]?.includes(permission) ?? false;
                    const possible =
                      roleCapabilities[member.role].includes(permission);
                    return (
                      <td key={permission}>
                        <input
                          type="checkbox"
                          className="access-grant-input"
                          aria-label={`${member.name} ${labels[permission]}`}
                          checked={checked}
                          disabled={pending || busy || (!possible && !checked)}
                          onChange={() => {
                            setDirty(true);
                            setMatrix((current) => ({
                              ...current,
                              [member.id]: checked
                                ? (current[member.id] ?? []).filter(
                                    (value) => value !== permission,
                                  )
                                : [...(current[member.id] ?? []), permission],
                            }));
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function AdminAccess() {
  const { user, refresh } = useAuth();
  const members = useResource<{ members: Member[]; grants: Grant[] }>(
    "/api/auth/access",
    { members: [], grants: [] },
  );
  const bases = useResource<{ bases: Base[] }>("/api/knowledge/bases", {
    bases: [],
  });
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState("viewer"),
    [selected, setSelected] = useState(""),
    [disabling, setDisabling] = useState<Member | null>(null);
  const { run, pending } = useAction();
  const toast = useToast();
  const base =
    bases.data?.bases.find((base) => base.id === selected) ??
    bases.data?.bases[0];
  const reload = () => {
    members.reload();
    bases.reload();
    void refresh();
  };
  return (
    <div className="page-content gp-page">
      <PageHeader
        title="账户与知识库授权"
        description="账户、会话与资源权限由服务端执行；旧演示成员和静态矩阵不会自动授予访问权。"
        action={
          <div className="access-actions">
            <button
              className="btn btn-secondary"
              disabled={pending || members.loading || bases.loading}
              onClick={reload}
            >
              刷新账户与授权
            </button>
            <button
              className="btn btn-primary"
              disabled={pending}
              onClick={() => setAdding(true)}
            >
              <Plus size={16} />
              创建账户
            </button>
          </div>
        }
      />
      <RequestStatus {...members} />
      <RequestStatus {...bases} />
      <div className="panel">
        <div className="access-heading">
          <div>
            <h3>
              <ShieldCheck size={18} /> 工作空间账户
            </h3>
            <p>修改角色或停用账户会撤销该账户的现有会话。</p>
          </div>
          <Badge tone="success">后端权限已启用</Badge>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>账户</th>
                <th>角色</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {members.data?.members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <div className="access-status">{member.email}</div>
                  </td>
                  <td>
                    <select
                      className="select"
                      aria-label={`${member.name}的账户角色`}
                      value={member.role}
                      disabled={pending}
                      onChange={(event) => {
                        const role = event.target.value;
                        void run(async () => {
                          await apiFetch(`/api/auth/members/${member.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              revision: member.revision,
                              role,
                              status: member.status,
                            }),
                          });
                          reload();
                          toast("账户角色已更新", "success");
                        });
                      }}
                    >
                      {Object.entries(roles).map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Badge
                      tone={member.status === "active" ? "success" : "warning"}
                    >
                      {member.status === "active" ? "已启用" : "已停用"}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={() => setDisabling(member)}
                    >
                      {member.status === "active" ? "停用账户" : "启用账户"}
                      {member.id === user?.memberId ? "（本人）" : ""}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="access-heading">
        <Field label="授权知识库">
          <select
            className="select"
            value={base?.id ?? ""}
            disabled={bases.loading}
            onChange={(event) => {
              const leaving = new Event("knowledge-hub:before-navigate", {
                cancelable: true,
              });
              if (
                !window.dispatchEvent(leaving) &&
                !window.confirm("切换知识库会放弃未保存的授权变更，是否继续？")
              )
                return;
              setSelected(event.target.value);
            }}
          >
            {bases.data?.bases.map((base) => (
              <option key={base.id} value={base.id}>
                {base.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {base && members.data && (
        <GrantMatrix
          key={base.id}
          base={base}
          members={members.data.members}
          grants={members.data.grants}
          onSaved={reload}
          busy={members.loading || bases.loading}
        />
      )}
      {!base && !bases.loading && (
        <div className="panel access-heading">
          尚无知识库，请先创建知识库，再授予成员访问权限。
        </div>
      )}
      {adding && (
        <Modal
          title="创建本地账户"
          onClose={() => {
            if (!pending) {
              setAdding(false);
              setPassword("");
            }
          }}
        >
          <form
            className="access-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await apiFetch("/api/auth/members", {
                  method: "POST",
                  body: JSON.stringify({ name, email, password, role }),
                });
                setAdding(false);
                setName("");
                setEmail("");
                setPassword("");
                reload();
                toast("账户已创建，请安全交付初始凭据", "success");
              });
            }}
          >
            <Field label="姓名" required>
              <input
                className="input"
                required
                maxLength={160}
                value={name}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="邮箱" required>
              <input
                className="input"
                type="email"
                required
                maxLength={254}
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field
              label="初始密码"
              required
              hint="12–128 个字符，不会发送邀请邮件。"
            >
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                disabled={pending}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <Field label="角色">
              <select
                className="select"
                value={role}
                disabled={pending}
                onChange={(event) => setRole(event.target.value)}
              >
                {Object.entries(roles).map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn btn-primary" disabled={pending}>
              {pending ? "正在创建…" : "创建账户"}
            </button>
          </form>
        </Modal>
      )}
      <ConfirmDialog
        open={!!disabling}
        title={
          disabling?.status === "active" ? "停用此账户？" : "重新启用此账户？"
        }
        description="角色与会话将在服务端重新校验，最后一位管理员不能被停用。"
        confirmLabel="确认变更"
        loading={pending}
        onCancel={() => setDisabling(null)}
        onConfirm={() =>
          void run(async () => {
            const member = disabling!;
            await apiFetch(`/api/auth/members/${member.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                revision: member.revision,
                role: member.role,
                status: member.status === "active" ? "disabled" : "active",
              }),
            });
            setDisabling(null);
            reload();
            toast("账户状态已更新", "success");
          })
        }
      />
    </div>
  );
}
export function AccessPage() {
  const { user } = useAuth();
  return user?.capabilities.includes("workspace.manage") ? (
    <AdminAccess />
  ) : (
    <MyAccess />
  );
}
