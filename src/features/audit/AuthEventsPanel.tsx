import { useResource } from "../../hooks/useResource";
import { RequestStatus } from "../../components/RequestStatus";
import { Badge } from "../../components/ui";
import { DataTable } from "../../components/ui/DataTable";
interface AuthEvent {
  id: string;
  time: string;
  action: string;
  actor_membership_id: string | null;
  target_id: string | null;
  outcome: string;
  request_id: string | null;
  method: string | null;
  http_status: number | null;
}
const labels: Record<string, string> = {
  bootstrap: "账户初始化",
  login: "登录",
  logout: "退出登录",
  "account.create": "创建账户",
  "account.update": "更新账户",
  "grant.replace": "保存库授权",
  "password.change": "修改密码",
  "request.denied": "请求拒绝",
  "request.committed": "请求提交",
};
export function AuthEventsPanel() {
  const events = useResource<{ events: AuthEvent[] }>("/api/auth/events", {
    events: [],
  });
  return (
    <section className="panel">
      <div className="access-heading">
        <div>
          <h3>身份与授权事件</h3>
          <p>
            最近 200
            条账户、会话、授权与请求记录；不保存密码、会话令牌或请求正文。
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={events.reload}
          disabled={events.loading}
        >
          刷新身份事件
        </button>
      </div>
      <RequestStatus {...events} />
      <DataTable
        ariaLabel="身份与授权事件"
        rows={events.data?.events ?? []}
        loading={events.loading}
        rowKey={(event) => event.id}
        emptyTitle="尚无身份事件"
        columns={[
          {
            key: "time",
            header: "时间",
            render: (event) => new Date(event.time).toLocaleString("zh-CN"),
          },
          {
            key: "action",
            header: "操作",
            render: (event) => labels[event.action] ?? event.action,
          },
          {
            key: "actor",
            header: "成员标识",
            render: (event) =>
              event.actor_membership_id ?? "未认证请求 / 初始化",
          },
          {
            key: "request",
            header: "请求与对象",
            render: (event) => (
              <>
                <code>{event.request_id ?? event.target_id ?? "—"}</code>
                {event.method && (
                  <small className="access-status">
                    {" "}
                    {event.method} · {event.http_status}
                  </small>
                )}
              </>
            ),
          },
          {
            key: "outcome",
            header: "结果",
            render: (event) => (
              <Badge
                tone={event.outcome === "committed" ? "success" : "warning"}
              >
                {event.outcome === "committed" ? "已记录提交" : "已记录拒绝"}
              </Badge>
            ),
          },
        ]}
      />
    </section>
  );
}
