import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
const migrationFiles = ["001-core.sql", "002-auth.sql"];

export function schemaName(schema: string) {
  if (!/^zhixu(?:_[a-z0-9_]+)?$/.test(schema) || schema.length > 63)
    throw new Error("INVALID_DATABASE_SCHEMA");
  return `"${schema}"`;
}
export async function useSchema(client: PoolClient, schema: string) {
  await client.query(
    `SET LOCAL search_path TO ${schemaName(schema)}, pg_catalog`,
  );
  await client.query("SET LOCAL statement_timeout = '30s'");
  await client.query("SET LOCAL lock_timeout = '10s'");
}
export async function migrateCore(client: PoolClient, schema: string) {
  const name = schemaName(schema);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `zhixu:migrate:${schema}`,
  ]);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
  await useSchema(client, schema);
  const exists = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [`${schema}.schema_migrations`],
  );
  const saved = exists.rows[0].present
    ? (
        await client.query(
          "SELECT version,checksum FROM schema_migrations ORDER BY version",
        )
      ).rows
    : [];
  const files = migrationFiles;
  if (
    saved.some(
      (row, index) => row.version !== index + 1 || row.version > files.length,
    )
  )
    throw new Error("DATABASE_MIGRATION_VERSION_MISMATCH");
  for (const [index, file] of files.entries()) {
    const sql = await readFile(
      new URL(`./migrations/${file}`, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (saved[index]) {
      if (saved[index].checksum !== checksum)
        throw new Error("DATABASE_MIGRATION_VERSION_MISMATCH");
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)",
      [index + 1, checksum],
    );
  }
}
export async function assertSchemaCurrent(client: PoolClient) {
  const saved = (
    await client.query(
      "SELECT version,checksum FROM schema_migrations ORDER BY version",
    )
  ).rows;
  if (saved.length !== migrationFiles.length)
    throw new Error("DATABASE_MIGRATION_REQUIRED");
  for (const [index, file] of migrationFiles.entries()) {
    const sql = await readFile(
      new URL(`./migrations/${file}`, import.meta.url),
      "utf8",
    );
    if (
      saved[index].version !== index + 1 ||
      saved[index].checksum !== createHash("sha256").update(sql).digest("hex")
    )
      throw new Error("DATABASE_MIGRATION_VERSION_MISMATCH");
  }
}
export async function transaction<T>(
  pool: Pool,
  schema: string,
  write: boolean,
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query(
      write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    await useSchema(client, schema);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
