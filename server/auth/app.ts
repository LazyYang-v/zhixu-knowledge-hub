import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { grantsInput } from "../../shared/contracts.js";
import { createApp } from "../app.js";
import { AppError, onError, requestContext } from "../http/errors.js";
import { FileStore } from "../services/files.js";
import { transaction } from "../db/session.js";
import { AuthService, authEvent, csrfToken } from "./service.js";
import { AuthorizedRepository } from "./repository.js";
import { requireCapability } from "./policy.js";

const identity = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(1).max(160),
    password: z.string().min(12).max(128),
  })
  .strict();
export const accountInput = identity.extend({
  role: z.enum(["admin", "editor", "viewer"]),
});
const loginInput = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(128) })
  .strict();
const memberUpdate = z
  .object({
    revision: z.number().int().positive(),
    role: z.enum(["admin", "editor", "viewer"]),
    status: z.enum(["active", "disabled"]),
  })
  .strict();
export const bootstrapInput = identity;
async function jsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 32_768) throw new Error();
    raw = JSON.parse(text);
  } catch {
    throw new AppError(400, "INVALID_JSON", "身份请求内容无效");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "身份请求参数无效，请检查字段和密码长度",
    );
  return parsed.data;
}
export function createAuthenticatedApp(
  auth: AuthService,
  options: {
    files?: FileStore;
    secureCookies?: boolean;
    origins?: string[];
  } = {},
) {
  const files = options.files ?? new FileStore();
  const secure = options.secureCookies !== false;
  const cookie = secure ? "__Host-zhixu_session" : "zhixu_session_local";
  const origins = options.origins ?? [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ];
  const app = new Hono();
  app.use(requestContext);
  app.use(
    "/api/*",
    cors({
      origin: (origin, c) =>
        [new URL(c.req.url).origin, ...origins].includes(origin)
          ? origin
          : undefined,
      credentials: true,
    }),
  );
  const limitBody = bodyLimit({
    maxSize: 24 * 1024 * 1024,
    onError: (c) => c.json({ error: "请求内容超过限制" }, 413),
  });
  app.get("/api/health", (c) =>
    c.json({ status: "ok", time: new Date().toISOString() }),
  );
  app.use("/api/*", async (c, next) => {
    await next();
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) ||
      [401, 403].includes(c.res.status)
    )
      await transaction(auth.pool, auth.schema, true, (client) =>
        authEvent(
          client,
          auth.tenantId,
          c.get("principal")?.memberId ?? null,
          c.res.status >= 400 ? "request.denied" : "request.committed",
          undefined,
          c.res.status >= 400 ? "denied" : "committed",
          {
            id: c.get("requestId"),
            method: c.req.method,
            status: c.res.status,
          },
        ),
      ).catch(() =>
        console.error(JSON.stringify({ code: "AUTH_REQUEST_AUDIT_FAILED" })),
      );
  });
  app.get("/api/auth/config", (c) =>
    c.json({ mode: "local", registration: "admin_only" }),
  );
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      if (!origin || ![new URL(c.req.url).origin, ...origins].includes(origin))
        throw new AppError(403, "ORIGIN_REJECTED", "请求来源未被允许");
    }
    await next();
  });
  app.post("/api/auth/login", limitBody, async (c) => {
    const input = await jsonBody(c.req.raw, loginInput);
    const result = await auth.login(input.email, input.password);
    c.set("principal", result.principal);
    c.set("authenticatedSubject", result.principal.userId);
    setCookie(c, cookie, result.token, {
      httpOnly: true,
      secure,
      sameSite: "Lax",
      path: "/",
      maxAge: 12 * 3600,
    });
    return c.json({ user: result.principal, csrfToken: result.csrfToken });
  });
  app.use("/api/*", async (c, next) => {
    const token = getCookie(c, cookie) ?? "";
    const p = await auth.session(token);
    c.set("principal", p);
    c.set("authenticatedSubject", p.userId);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const csrf = c.req.header("X-CSRF-Token") ?? "";
      if (
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(csrfToken(token)))
      )
        throw new AppError(403, "CSRF_REJECTED", "会话校验失败，请刷新后重试");
    }
    if (
      c.req.method === "POST" &&
      c.req.path.replace(/\/$/, "") === "/api/knowledge/files"
    )
      requireCapability(p, "upload");
    await next();
  });
  // Origin, session, CSRF and upload capability checks must not consume a body.
  app.use("/api/*", limitBody);
  app.get("/api/auth/me", (c) =>
    c.json({
      user: c.get("principal"),
      csrfToken: csrfToken(getCookie(c, cookie)!),
    }),
  );
  app.post("/api/auth/logout", async (c) => {
    await auth.logout(getCookie(c, cookie)!);
    deleteCookie(c, cookie, { path: "/", secure });
    return c.json({ ok: true });
  });
  app.post("/api/auth/password", async (c) => {
    const input = await jsonBody(
      c.req.raw,
      z
        .object({
          currentPassword: z.string().min(1).max(128),
          newPassword: z.string().min(12).max(128),
        })
        .strict(),
    );
    await auth.changePassword(
      getCookie(c, cookie)!,
      input.currentPassword,
      input.newPassword,
    );
    deleteCookie(c, cookie, { path: "/", secure });
    return c.json({ ok: true });
  });
  app.get("/api/auth/access", async (c) =>
    c.json(await auth.access(getCookie(c, cookie)!)),
  );
  app.post("/api/auth/members", async (c) => {
    const input = await jsonBody(c.req.raw, accountInput);
    const id = await auth.createMember(getCookie(c, cookie)!, input);
    return c.json({ memberId: id }, 201);
  });
  app.patch("/api/auth/members/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success)
      throw new AppError(400, "VALIDATION_ERROR", "账户标识无效");
    await auth.updateMember(
      getCookie(c, cookie)!,
      id.data,
      await jsonBody(c.req.raw, memberUpdate),
    );
    return c.json({ ok: true });
  });
  app.put("/api/knowledge/bases/:id/grants", async (c) => {
    await auth.grant(
      getCookie(c, cookie)!,
      c.req.param("id"),
      await jsonBody(c.req.raw, grantsInput),
    );
    return c.json({ ok: true });
  });
  app.get("/api/auth/events", async (c) => {
    if (!c.get("principal")!.capabilities.includes("audit.read"))
      throw new AppError(403, "FORBIDDEN", "没有审计权限");
    const events = await transaction(
      auth.pool,
      auth.schema,
      false,
      async (client) =>
        (
          await client.query(
            "SELECT id,actor_membership_id,action,target_id,outcome,time,request_id,method,http_status FROM auth_events WHERE tenant_id=$1 ORDER BY time DESC,id LIMIT 200",
            [auth.tenantId],
          )
        ).rows,
    );
    return c.json({ events });
  });
  app.all("/api/*", async (c) => {
    const principal = c.get("principal")!;
    const token = getCookie(c, cookie)!;
    const raw =
      !["GET", "HEAD"].includes(c.req.method) &&
      c.req.header("Content-Type")?.includes("application/json")
        ? await c.req.raw
            .clone()
            .json()
            .catch(() => ({}))
        : {};
    const body =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw))
        : {};
    const store = new AuthorizedRepository(
      auth.pool,
      auth,
      token,
      { method: c.req.method, path: c.req.path, body },
      (p) => Object.assign(principal, p),
    );
    const response = await createApp(
      store,
      files,
      principal,
      c.get("requestId"),
    ).fetch(c.req.raw);
    return response;
  });
  app.onError(onError);
  return app;
}
