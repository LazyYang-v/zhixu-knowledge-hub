import { startWorker } from "./jobs/worker.js";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createSeedDb } from "./data/seed.js";
import { Store } from "./lib/store.js";
import { Pool } from "pg";
import { createAuthenticatedApp } from "./auth/app.js";
import { AuthService } from "./auth/service.js";
import { PostgresRepository } from "./repositories/postgres.js";
import { assertSchemaCurrent, transaction } from "./db/session.js";
import type { StateRepository } from "./repositories/state.js";

const storage = process.env.ZHIXU_STORAGE ?? "json";
if (!["json", "postgres"].includes(storage))
  throw new Error("INVALID_STORAGE_MODE");
let store: StateRepository;
let app;
let closeRepository = async () => {};
const insecureLocal = process.env.ZHIXU_ALLOW_INSECURE_LOCAL_AUTH === "true";
if (storage === "postgres") {
  if (!process.env.ZHIXU_DATABASE_URL || !process.env.ZHIXU_TENANT_ID)
    throw new Error("POSTGRES_CONFIGURATION_REQUIRED");
  if (insecureLocal && process.env.NODE_ENV === "production")
    throw new Error("HTTPS_AUTH_REQUIRED");
  const pool = new Pool({
    connectionString: process.env.ZHIXU_DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 10000,
    application_name: "zhixu-authenticated-api",
  });
  pool.on("error", () =>
    console.error(JSON.stringify({ code: "DATABASE_POOL_ERROR" })),
  );
  const schema = process.env.ZHIXU_DB_SCHEMA ?? "zhixu",
    tenant = process.env.ZHIXU_TENANT_ID;
  try {
    await transaction(pool, schema, false, async (client) => {
      await assertSchemaCurrent(client);
      const found = await client.query(
        "SELECT 1 FROM tenants t JOIN memberships m ON m.tenant_id=t.id WHERE t.id=$1 AND t.status='active' AND m.status='active' LIMIT 1",
        [tenant],
      );
      if (!found.rowCount)
        throw new Error("EXPLICIT_AUTH_INITIALIZATION_REQUIRED");
    });
  } catch {
    await pool.end();
    throw new Error("DATABASE_OR_AUTH_INITIALIZATION_REQUIRED");
  }
  store = new PostgresRepository(pool, tenant, schema);
  closeRepository = () => pool.end();
  app = createAuthenticatedApp(new AuthService(pool, schema, tenant), {
    secureCookies: !insecureLocal,
    origins: process.env.CORS_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  });
} else {
  store = new Store(createSeedDb());
  app = createApp(store);
}
const stopWorker = startWorker(store);
const port = Number(process.env.PORT) || 8787;

const server = serve(
  {
    fetch: app.fetch,
    port,
    ...(storage === "postgres" ? { hostname: "127.0.0.1" } : {}),
  },
  (info) => {
    console.log(`知识库后端已启动：http://127.0.0.1:${info.port}`);
    console.log(`健康检查：http://127.0.0.1:${info.port}/api/health`);
  },
);

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => {
    if (
      "closeAllConnections" in server &&
      typeof server.closeAllConnections === "function"
    )
      server.closeAllConnections();
    process.exit(1);
  }, 20_000);
  timeout.unref();
  await Promise.all([
    stopWorker(),
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
  ]);
  await closeRepository();
  clearTimeout(timeout);
  process.exit(0);
}
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    void shutdown().catch(() => process.exit(1));
  });
