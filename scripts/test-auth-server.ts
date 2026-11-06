import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { migrateCore, schemaName } from "../server/db/session.js";
import { writeSqlState } from "../server/repositories/postgres.js";
import { createSeedDb } from "../server/data/seed.js";
import { AuthService } from "../server/auth/service.js";

if (!process.env.ZHIXU_TEST_DATABASE_URL)
  throw new Error("USE_ISOLATED_POSTGRES_TEST_RUNNER");
const pool = new Pool({
  connectionString: process.env.ZHIXU_TEST_DATABASE_URL,
  max: 3,
});
const schema = `zhixu_test_${randomUUID().replaceAll("-", "")}`,
  directory = await mkdtemp(join(tmpdir(), "zhixu-auth-browser-"));
const db = createSeedDb(),
  tenant = db.settings.tenant,
  password = "browser-fixture-password-2026";
let child: ReturnType<typeof spawn> | undefined,
  closing = false;
async function cleanup(code: number) {
  if (closing) return;
  closing = true;
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${schemaName(schema)} CASCADE`);
  } finally {
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
  process.exit(code);
}
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await migrateCore(client, schema);
    await client.query("INSERT INTO tenants(id,name) VALUES($1,$2)", [
      tenant,
      db.settings.workspace,
    ]);
    await writeSqlState(client, tenant, db);
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  const auth = new AuthService(pool, schema, tenant);
  const adminId = await auth.bootstrap({
    email: "admin@browser.test",
    name: "Browser Admin",
    password,
  });
  const admin = await auth.login("admin@browser.test", password);
  const readerId = await auth.createMember(admin.token, {
    email: "reader@browser.test",
    name: "Browser Reader",
    password,
    role: "viewer",
  });
  for (const base of db.bases)
    await auth.grant(admin.token, base.id, {
      revision: base.revision ?? 1,
      grants: [
        {
          memberId: adminId,
          permissions: ["read", "write", "publish", "manage"],
        },
        ...(base.id === "b1"
          ? [{ memberId: readerId, permissions: ["read"] }]
          : []),
      ],
    });
  await auth.logout(admin.token);
  child = spawn(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "server/index.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        ZHIXU_STORAGE: "postgres",
        ZHIXU_DATABASE_URL: process.env.ZHIXU_TEST_DATABASE_URL,
        ZHIXU_TENANT_ID: tenant,
        ZHIXU_DB_SCHEMA: schema,
        ZHIXU_ALLOW_INSECURE_LOCAL_AUTH: "true",
        NODE_ENV: "test",
        PORT: "18788",
        DATA_DIR: directory,
        CORS_ORIGINS: "http://127.0.0.1:15174",
      },
    },
  );
  child.on("exit", (code) => void cleanup(code ?? 0));
  child.on("error", () => void cleanup(1));
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => {
      child?.kill(signal);
    });
} catch {
  console.error("隔离身份测试服务启动失败");
  await cleanup(1);
}
