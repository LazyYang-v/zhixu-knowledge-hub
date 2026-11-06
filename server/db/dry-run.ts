import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Db } from "../types.js";
import { migrateCore, schemaName } from "./session.js";
import { canonical, normalizeState, tableKeys } from "./state-mapping.js";
import { readSqlState, writeSqlState } from "../repositories/postgres.js";

export async function dryRunPostgres(
  pool: Pool,
  input: Db,
  tenant: string,
  schema = `zhixu_dryrun_${randomUUID().replaceAll("-", "")}`,
) {
  schemaName(schema);
  if (!schema.startsWith("zhixu_dryrun_"))
    throw new Error("DRY_RUN_SCHEMA_REQUIRED");
  const normalized = normalizeState(input, tenant);
  const client = await pool.connect();
  let report: {
    sqlIntegrity: "passed";
    rolledBack: boolean;
    cutoverReady: false;
    counts: Record<string, number>;
    pending: string[];
  };
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const existing = await client.query(
      "SELECT 1 FROM pg_namespace WHERE nspname=$1",
      [schema],
    );
    if (existing.rowCount) throw new Error("DRY_RUN_SCHEMA_ALREADY_EXISTS");
    await migrateCore(client, schema);
    await client.query("INSERT INTO tenants(id,name) VALUES($1,$2)", [
      tenant,
      normalized.settings.workspace,
    ]);
    await writeSqlState(client, tenant, normalized);
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const saved = await readSqlState(client, tenant);
    if (canonical(saved) !== canonical(normalized))
      throw new Error("MIGRATION_ROUND_TRIP_MISMATCH");
    const counts: Record<string, number> = {};
    for (const table of Object.keys(tableKeys))
      counts[table] = Number(
        (
          await client.query(
            `SELECT count(*) AS count FROM "${table}" WHERE tenant_id=$1`,
            [tenant],
          )
        ).rows[0].count,
      );
    report = {
      sqlIntegrity: "passed",
      rolledBack: false,
      cutoverReady: false,
      counts,
      pending: [
        "verified_identity_mapping",
        "resource_grants_mapping",
        "artifact_retention_and_copy",
        "authenticated_api_acceptance",
        "explicit_cutover",
      ],
    };
  } finally {
    // DDL, rows and migration history all belong to this one transaction.
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
  const remaining = await pool.query(
    "SELECT 1 FROM pg_namespace WHERE nspname=$1",
    [schema],
  );
  if (remaining.rowCount) throw new Error("DRY_RUN_ROLLBACK_NOT_VERIFIED");
  report.rolledBack = true;
  return report;
}
