import { operationKey } from "./operation-key";
import { getDataMode } from "./data-mode";
import { getCsrfToken, authenticationExpired } from "./auth-session";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code = "NETWORK_ERROR",
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请重试";
}

/** null is reserved for explicitly selected local demo mode. Server failures always reject. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<T | null> {
  if (getDataMode() === "demo") return null;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const headers = new Headers(init?.headers);
  if (getCsrfToken()) headers.set("X-CSRF-Token", getCsrfToken()!);
  if (!(init?.body instanceof FormData))
    headers.set("content-type", "application/json");
  const methodName = init?.method?.toUpperCase() ?? "GET";
  const operation =
    methodName !== "GET" &&
    !path.startsWith("/api/retrieval/") &&
    !path.startsWith("/api/auth/") &&
    !headers.has("Idempotency-Key") &&
    !(init?.body instanceof FormData)
      ? await operationKey(
          methodName,
          path,
          JSON.stringify({
            body: typeof init?.body === "string" ? init.body : "",
            ifMatch: headers.get("If-Match"),
          }),
        )
      : undefined;
  if (operation) headers.set("Idempotency-Key", operation.key);
  try {
    const response = await fetch(path, { ...init, headers, signal });
    const body = await response.json().catch(() => null);
    if (response.status === 401) authenticationExpired();
    if (!response.ok)
      throw new ApiError(
        body?.error || `请求失败（${response.status}）`,
        response.status,
        body?.code || `HTTP_${response.status}`,
        body?.requestId,
      );
    if (body === null || typeof body !== "object" || Array.isArray(body))
      throw new ApiError(
        "服务器返回了无效的数据",
        response.status,
        "INVALID_RESPONSE",
      );
    const pathname = path.split("?")[0].replace(/\/$/, "");
    const method = init?.method?.toUpperCase() ?? "GET";
    const collection: Record<string, string> = {
      "/api/conversations": "conversations",
      "/api/knowledge/bases": "bases",
      "/api/knowledge/documents": "documents",
      "/api/knowledge/tasks": "tasks",
      "/api/evaluations": "evaluations",
      "/api/audit": "logs",
    };
    const field =
      method === "GET"
        ? pathname.endsWith("/events")
          ? "events"
          : collection[pathname]
        : undefined;
    const entity =
      method === "DELETE" ||
      (method === "PUT" &&
        /^\/api\/knowledge\/bases\/[^/]+\/grants$/.test(pathname))
        ? "ok"
        : pathname.includes("/feedback")
          ? "message"
          : pathname.endsWith("/messages")
            ? "conversation"
            : pathname === "/api/settings"
              ? "settings"
              : pathname === "/api/overview"
                ? "stats"
                : pathname === "/api/retrieval/search"
                  ? "trace"
                  : method !== "GET" &&
                      pathname.startsWith("/api/knowledge/bases")
                    ? "base"
                    : method !== "GET" &&
                        pathname.startsWith("/api/knowledge/documents")
                      ? "document"
                      : method !== "GET" &&
                          pathname.startsWith("/api/knowledge/tasks")
                        ? "task"
                        : method !== "GET" &&
                            pathname.startsWith("/api/permissions/members")
                          ? "member"
                          : method === "POST" &&
                              pathname === "/api/conversations"
                            ? "conversation"
                            : method === "POST" &&
                                pathname === "/api/evaluations"
                              ? "evaluation"
                              : undefined;
    if (
      (field && !Array.isArray(body[field])) ||
      (entity &&
        (entity === "ok"
          ? body.ok !== true
          : !body[entity] || typeof body[entity] !== "object"))
    )
      throw new ApiError(
        "服务器响应缺少必要字段",
        response.status,
        "INVALID_RESPONSE",
      );
    operation?.complete();
    if (init?.method && init.method.toUpperCase() !== "GET")
      window.dispatchEvent(new Event("knowledge-hub:changed"));
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (init?.signal?.aborted) throw new ApiError("请求已取消", 0, "ABORTED");
    if (timeout.aborted) throw new ApiError("请求超时，请重试", 0, "TIMEOUT");
    throw new ApiError("无法连接服务端，请检查连接后重试");
  }
}
