import type { Context, MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { AuditLog, Db, ProcessingTask } from "../types.js";
import type { StateRepository } from "../repositories/state.js";
import { createId } from "../lib/util.js";
import { errorCodeForStatus } from "../http/errors.js";

const operations: Record<string, [action: string, targetType: string]> = {
  "POST /api/conversations": ["新建会话", "conversation"],
  "DELETE /api/conversations/:id": ["删除会话", "conversation"],
  "POST /api/conversations/:id/messages": ["智能问答", "conversation"],
  "PATCH /api/conversations/:id/messages/:messageId/feedback": [
    "回答反馈",
    "message",
  ],
  "POST /api/knowledge/bases": ["知识库创建", "knowledge_base"],
  "PUT /api/knowledge/bases/:id": ["知识库更新", "knowledge_base"],
  "DELETE /api/knowledge/bases/:id": ["知识库删除", "knowledge_base"],
  "POST /api/knowledge/documents/import": ["文档导入", "document"],
  "PUT /api/knowledge/documents/:id": ["文档更新", "document"],
  "DELETE /api/knowledge/documents/:id": ["文档删除", "document"],
  "POST /api/knowledge/documents/:id/publish": ["文档发布", "document"],
  "POST /api/knowledge/documents/:id/archive": ["文档归档", "document"],
  "POST /api/knowledge/documents/:id/advance": ["手动推进请求", "document"],
  "POST /api/knowledge/documents/:id/retry": ["文档任务重试", "document"],
  "PUT /api/knowledge/documents/:id/chunks": ["分块编辑", "document"],
  "PUT /api/knowledge/documents/:id/chunks/:index": ["分块编辑", "document"],
  "POST /api/knowledge/documents/:id/rollback": ["版本回滚", "document"],
  "POST /api/knowledge/tasks/:id/retry": ["任务重试", "task"],
  "POST /api/knowledge/tasks/:id/cancel": ["任务取消", "task"],
  "POST /api/knowledge/files": ["文件上传", "file"],
  "POST /api/retrieval/search": ["检索请求", "retrieval"],
  "POST /api/evaluations": ["规则评测", "evaluation"],
  "POST /api/permissions/members": ["成员创建", "member"],
  "PUT /api/permissions/members/:id": ["成员更新", "member"],
  "DELETE /api/permissions/members/:id": ["成员删除", "member"],
  "PUT /api/permissions/rules": ["权限配置", "permission_rule"],
  "PUT /api/settings": ["系统设置", "settings"],
};
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function identifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value)
    ? value
    : undefined;
}
function template(c: Context) {
  const path = routePath(c, -1).replace(/\/$/, "");
  return operations[`${c.req.method} ${path}`] ? path : "/api/unmatched";
}
/** Only trusted route metadata and server-created IDs; never copy request values into audit. */
export function appendRequestAudit(
  db: Db,
  c: Context,
  result?: unknown,
  failure?: { status: number; code: string },
) {
  const path = template(c);
  const [action, targetType] = operations[`${c.req.method} ${path}`] ?? [
    "未匹配写入请求",
    "unknown",
  ];
  const data = record(result);
  const conversation = record(data.conversation);
  const answer = record(data.answerMessage);
  const entity = record(data.doc);
  const subject = c.get("authenticatedSubject");
  const log: AuditLog = {
    schemaVersion: 1,
    id: createId("log"),
    time: new Date().toISOString(),
    user: c.get("principal")?.name ?? subject ?? "未认证请求",
    actorKind: subject ? "user" : "anonymous",
    actorId: subject,
    department: "未核验",
    action,
    content: `${action}：${failure ? "请求失败" : "请求已提交"}`,
    source: "服务端 API",
    status: failure ? "失败" : answer.kind === "unknown" ? "未命中" : "已提交",
    docs: [],
    authorization: "not_configured",
    requestId: c.get("requestId"),
    method: c.req.method,
    route: path,
    targetType,
    targetId: failure
      ? undefined
      : identifier(
          data.id ??
            entity.id ??
            conversation.id ??
            c.req.param("messageId") ??
            c.req.param("id"),
        ),
    conversationId: failure ? undefined : identifier(conversation.id),
    messageId: failure
      ? undefined
      : identifier(
          answer.id ?? (targetType === "message" ? data.id : undefined),
        ),
    changedFields: Object.keys(c.get("validatedBody") ?? {})
      .filter((field) => field !== "revision")
      .sort(),
    outcome: failure ? "failed" : "committed",
    httpStatus: failure?.status,
    errorCode: failure?.code,
  };
  db.auditLogs.push(log);
  return log;
}
export function appendTaskAudit(db: Db, task: ProcessingTask) {
  db.auditLogs.push({
    schemaVersion: 1,
    id: createId("log"),
    time: new Date().toISOString(),
    user: "文本处理器",
    actorKind: "system",
    department: "系统",
    action: "后台文本处理",
    content: `任务状态：${task.job?.state ?? task.status}`,
    source: "后台任务",
    status: task.status === "done" ? "已提交" : "失败",
    docs: [],
    authorization: "not_configured",
    targetType: "task",
    targetId: task.id,
    outcome: task.status === "done" ? "committed" : "failed",
    errorCode:
      task.error && /^[A-Z][A-Z0-9_]{0,80}$/.test(task.error)
        ? task.error
        : undefined,
  });
}
export function auditView(log: AuditLog): AuditLog {
  return {
    ...log,
    actorKind: log.actorKind ?? "legacy_unverified",
    authorization: "not_configured",
  };
}
/** Storage failures must preserve the original HTTP error; failure audit is best effort. */
export function auditFailures(repository: StateRepository): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (
      !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) ||
      c.res.status < 400
    )
      return;
    const body: unknown = await c.res
      .clone()
      .json()
      .catch(() => null);
    const raw = record(body).code;
    const code =
      typeof raw === "string" && /^[A-Z][A-Z0-9_]{0,80}$/.test(raw)
        ? raw
        : errorCodeForStatus(c.res.status);
    try {
      await repository.update((db) =>
        appendRequestAudit(db, c, undefined, { status: c.res.status, code }),
      );
    } catch {
      console.error(
        JSON.stringify({
          requestId: c.get("requestId"),
          code: "AUDIT_WRITE_FAILED",
          status: c.res.status,
        }),
      );
    }
  };
}
