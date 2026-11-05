import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createSeedDb } from "./data/seed.js";
import { Store } from "./lib/store.js";

const store = new Store(createSeedDb());
const app = createApp(store);
const port = Number(process.env.PORT) || 8787;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`知识库后端已启动：http://127.0.0.1:${info.port}`);
  console.log(`健康检查：http://127.0.0.1:${info.port}/api/health`);
});
