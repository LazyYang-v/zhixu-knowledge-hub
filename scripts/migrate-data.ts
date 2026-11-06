import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import {
  checkDataFile,
  readRegularFile,
} from "../server/services/data-check.js";
import { dryRunPostgres } from "../server/db/dry-run.js";
import type { Db } from "../server/types.js";

const usage =
  "npm run --silent data:dry-run -- --input <stopped-copy.json> [--files-dir <copied-files>] --tenant <tenant-id> --connection-env <ZHIXU_...>";
export async function migrateDataCommand(args: string[]) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(usage);
    return 0;
  }
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index],
      value = args[index + 1];
    if (
      !["--input", "--files-dir", "--tenant", "--connection-env"].includes(
        key,
      ) ||
      options.has(key) ||
      !value ||
      value.startsWith("--")
    ) {
      console.error(usage);
      return 2;
    }
    options.set(key, value);
  }
  const environment = options.get("--connection-env") ?? "";
  if (
    !options.get("--input") ||
    !options.get("--tenant") ||
    !/^ZHIXU_[A-Z0-9_]+$/.test(environment) ||
    !process.env[environment]
  ) {
    console.error(usage);
    return 2;
  }
  let pool: Pool | undefined;
  try {
    const preflight = await checkDataFile({
      input: options.get("--input")!,
      filesDirectory: options.get("--files-dir"),
    });
    if (preflight.status === "failed" || preflight.status === "incomplete") {
      console.log(JSON.stringify({ phase: "preflight", preflight }));
      return preflight.status === "failed" ? 1 : 2;
    }
    // Re-read through the bounded no-follow reader and compare with the checked copy.
    const source = await readRegularFile(
      options.get("--input")!,
      64 * 1024 * 1024,
    );
    if (
      createHash("sha256").update(source.bytes).digest("hex") !==
      preflight.sourceSha256
    )
      throw new Error("SOURCE_CHANGED_AFTER_PREFLIGHT");
    const db = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(source.bytes),
    ) as Db;
    pool = new Pool({
      connectionString: process.env[environment],
      connectionTimeoutMillis: 10_000,
      max: 2,
      application_name: "zhixu-data-dry-run",
    });
    const sql = await dryRunPostgres(pool, db, options.get("--tenant")!);
    console.log(
      JSON.stringify(
        {
          phase: "sql-dry-run",
          sourceSha256: preflight.sourceSha256,
          preflightWarnings: preflight.issueCounts,
          ...sql,
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
        ? error.message
        : "SQL_DRY_RUN_FAILED";
    console.error(JSON.stringify({ code, cutoverReady: false }));
    return 1;
  } finally {
    await pool?.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await migrateDataCommand(process.argv.slice(2));
