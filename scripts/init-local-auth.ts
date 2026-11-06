import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { bootstrapInput } from "../server/auth/app.js";
import { AuthService } from "../server/auth/service.js";
import { migrateCore, schemaName } from "../server/db/session.js";
import { writeSqlState } from "../server/repositories/postgres.js";
import { createSeedDb } from "../server/data/seed.js";
import { AppError } from "../server/http/errors.js";

const usage =
  "npm run --silent auth:init -- --connection-env <ZHIXU_...> --tenant <tenant-id> --email <email> --name <display-name> [--schema zhixu] [--create-empty-workspace --workspace <name>]; password comes from ZHIXU_BOOTSTRAP_PASSWORD";
export async function initializeAuthCommand(args: string[]) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
    return 0;
  }
  const options = new Map<string, string>();
  let empty = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === "--create-empty-workspace" && !empty) {
      empty = true;
      continue;
    }
    const value = args[++index];
    if (
      ![
        "--connection-env",
        "--tenant",
        "--email",
        "--name",
        "--schema",
        "--workspace",
      ].includes(key) ||
      options.has(key) ||
      !value ||
      value.startsWith("--")
    ) {
      console.error(usage);
      return 2;
    }
    options.set(key, value);
  }
  const env = options.get("--connection-env") ?? "",
    tenant = options.get("--tenant"),
    schema = options.get("--schema") ?? "zhixu";
  const input = bootstrapInput.safeParse({
    email: options.get("--email"),
    name: options.get("--name"),
    password: process.env.ZHIXU_BOOTSTRAP_PASSWORD,
  });
  if (
    !/^ZHIXU_[A-Z0-9_]+$/.test(env) ||
    !process.env[env] ||
    !tenant ||
    tenant.length > 100 ||
    !input.success ||
    (empty && !options.get("--workspace")) ||
    (!empty && options.has("--workspace"))
  ) {
    console.error(usage);
    return 2;
  }
  let pool: Pool | undefined;
  try {
    schemaName(schema);
    pool = new Pool({
      connectionString: process.env[env],
      max: 2,
      connectionTimeoutMillis: 10000,
      application_name: "zhixu-explicit-auth-bootstrap",
    });
    const auth = new AuthService(pool, schema, tenant);
    const memberId = await auth.bootstrap(input.data, async (client) => {
      await migrateCore(client, schema);
      if (empty) {
        if (
          (await client.query("SELECT 1 FROM tenants WHERE id=$1", [tenant]))
            .rowCount
        )
          throw new AppError(
            409,
            "WORKSPACE_ALREADY_EXISTS",
            "不能用空工作空间初始化覆盖已有租户",
          );
        const seed = createSeedDb();
        seed.settings.tenant = tenant;
        seed.settings.workspace = options.get("--workspace")!;
        seed.bases = [];
        seed.documents = [];
        seed.tasks = [];
        seed.members = [];
        seed.conversations = [];
        seed.auditLogs = [];
        seed.evaluations = [];
        seed.rules = {};
        await client.query("INSERT INTO tenants(id,name) VALUES($1,$2)", [
          tenant,
          seed.settings.workspace,
        ]);
        await writeSqlState(client, tenant, seed);
      }
    });
    console.log(
      JSON.stringify({
        created: true,
        memberId,
        automaticContentGrants: false,
      }),
    );
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        code:
          error instanceof AppError ? error.code : "AUTH_INITIALIZATION_FAILED",
      }),
    );
    return 1;
  } finally {
    await pool?.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await initializeAuthCommand(process.argv.slice(2));
