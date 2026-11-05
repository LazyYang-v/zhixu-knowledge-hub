import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import type { Store } from "./lib/store.js";
import { conversationRoutes } from "./routes/conversations.js";
import { governanceRoutes } from "./routes/governance.js";
import { knowledgeRoutes } from "./routes/knowledge.js";

export function createApp(store: Store) {
  const app = new Hono();
  app.use(logger());
  app.use("/api/*", cors());

  app.get("/api/health", (c) =>
    c.json({ status: "ok", time: new Date().toISOString() }),
  );

  const api = app.basePath("/api");
  api.route("/conversations", conversationRoutes(store));
  api.route("/knowledge", knowledgeRoutes(store));
  api.route("/", governanceRoutes(store));

  app.notFound((c) => c.json({ error: "接口不存在" }, 404));
  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: "服务器内部错误" }, 500);
  });
  return app;
}
