import { requestContext, onError } from "./http/errors.js";
import { validateRequest } from "./http/validation.js";
import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";

import { cors } from "hono/cors";
import type { StateRepository } from "./repositories/state.js";
import { conversationRoutes } from "./routes/conversations.js";
import { governanceRoutes } from "./routes/governance.js";
import { knowledgeRoutes } from "./routes/knowledge.js";
import { fileRoutes } from "./routes/files.js";
import { FileStore } from "./services/files.js";
import { auditFailures } from "./services/audit.js";

export function createApp(
  store: StateRepository,
  files = new FileStore(),
  principal?: import("./auth/service.js").Principal,
  requestId?: string,
) {
  const app = new Hono();
  if (requestId)
    app.use(async (c, next) => {
      c.set("requestId", requestId);
      await next();
    });
  app.use(requestContext);
  if (principal)
    app.use("/api/*", async (c, next) => {
      c.set("principal", principal);
      c.set("authenticatedSubject", principal.userId);
      await next();
    });
  app.use("/api/*", auditFailures(store));

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 24 * 1024 * 1024,
      onError: (c) => c.json({ error: "请求内容超过 24MB 限制" }, 413),
    }),
  );
  app.use("/api/*", validateRequest);
  const origins = (
    process.env.CORS_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    "/api/*",
    cors({
      origin: (origin, c) =>
        [new URL(c.req.url).origin, ...origins].includes(origin)
          ? origin
          : undefined,
    }),
  );

  app.get("/api/health", (c) =>
    c.json({ status: "ok", time: new Date().toISOString() }),
  );

  const api = app.basePath("/api");
  api.get("/auth/config", (c) =>
    c.json({ mode: principal ? "local" : "legacy_unsecured" }),
  );
  api.route("/conversations", conversationRoutes(store));
  api.route("/knowledge/files", fileRoutes(store, files));
  api.route("/knowledge", knowledgeRoutes(store, files));
  api.route("/", governanceRoutes(store));

  app.notFound((c) => c.json({ error: "接口不存在" }, 404));
  app.onError(onError);
  return app;
}
