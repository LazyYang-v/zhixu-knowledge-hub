declare module "hono" {
  interface ContextVariableMap {
    authenticatedSubject?: string;
    principal?: import("../auth/service.js").Principal;
    requestId: string;
    validatedBody: Record<string, unknown>;
  }
}
import { randomUUID } from "node:crypto";
import { routePath } from "hono/route";
import type { Context, MiddlewareHandler } from "hono";
export class AppError extends Error {
  constructor(
    public readonly status:
      400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 503,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
export function fail(
  status: AppError["status"],
  code: string,
  message: string,
): never {
  throw new AppError(status, code, message);
}
const codes: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "INVALID_STATE",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  503: "DEPENDENCY_UNAVAILABLE",
};
export const errorCodeForStatus = (status: number) =>
  codes[status] ?? "REQUEST_FAILED";
export const requestContext: MiddlewareHandler = async (c, next) => {
  const started = performance.now();
  const requestId = c.get("requestId") ?? randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-ID", requestId);
  await next();
  console.info(
    JSON.stringify({
      requestId,
      method: c.req.method,
      path: routePath(c, -1) || "/unmatched",
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    }),
  );
  if (c.res.status >= 400) {
    const raw: unknown = await c.res
      .clone()
      .json()
      .catch(() => null);
    const existing =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw))
        : {};
    c.res = new Response(
      JSON.stringify({
        error: existing?.error ?? "请求失败",
        code: existing?.code ?? errorCodeForStatus(c.res.status),
        requestId,
        details: existing?.details,
      }),
      { status: c.res.status, headers: c.res.headers },
    );
    c.header("Content-Type", "application/json; charset=UTF-8");
  }
};
export function onError(error: Error, c: Context) {
  if (error instanceof AppError)
    return c.json(
      {
        error: error.message,
        code: error.code,
        requestId: c.get("requestId"),
        details: error.details,
      },
      error.status,
    );
  console.error(
    JSON.stringify({
      requestId: c.get("requestId"),
      code: "INTERNAL_ERROR",
      name: error.name,
    }),
  );
  return c.json(
    {
      error: "服务器暂时无法处理请求",
      code: "INTERNAL_ERROR",
      requestId: c.get("requestId"),
    },
    500,
  );
}
