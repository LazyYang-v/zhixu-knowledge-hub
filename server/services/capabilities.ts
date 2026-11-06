import type { Citation, Message, RetrievalTrace } from "../types.js";

export function unconfiguredPermission() {
  return {
    status: "not_configured" as const,
    checked: [],
    result: "身份认证与访问控制尚未接入，未执行权限校验",
  };
}
export function citationView(
  source: Citation,
  mode: Message["answerMode"],
): Citation {
  return {
    ...source,
    provenance: mode === "rule_demo" ? "demo" : "legacy_unverified",
    verified: false,
  };
}
export function traceView(
  trace: RetrievalTrace,
  authorized = false,
): RetrievalTrace {
  return {
    ...trace,
    implementation: trace.implementation ?? "legacy_unverified",
    timing: trace.timing ?? "unverified",
    permissionFiltering: authorized ? "enforced" : "not_configured",
    stages: trace.stages.map((stage, index) =>
      index === 0
        ? {
            ...stage,
            name: authorized
              ? "候选范围筛选（后端授权）"
              : "候选范围筛选（未授权校验）",
            detail: authorized
              ? "服务端按当前租户、成员库授权与已发布版本限制候选范围；后续打分仍为规则演示"
              : "仅筛选文档状态和分类；未执行租户、部门或角色访问控制",
          }
        : stage,
    ),
  };
}
/** Normalize old claims only in response DTOs; preserve the original stored history. */
export function messageView(message: Message, authorized = false): Message {
  if (message.role !== "assistant") return message;
  const answerMode = message.answerMode ?? "legacy_unverified";
  return {
    ...message,
    answerMode,
    permission: authorized
      ? {
          status: "enforced",
          checked: ["可信会话", "当前租户与成员授权", "已发布来源"],
          result: "已执行后端资源授权；答案与引用仍是规则演示",
        }
      : unconfiguredPermission(),
    sources: message.sources?.map((source) => citationView(source, answerMode)),
    retrieval: message.retrieval
      ? traceView(message.retrieval, authorized)
      : undefined,
  };
}
