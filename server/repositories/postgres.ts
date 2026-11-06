import type { Pool, PoolClient } from "pg";
import type { Db } from "../types.js";
import type { StateRepository } from "./state.js";
import { transaction } from "../db/session.js";
import {
  canonical,
  hydrateState,
  jsonColumns,
  normalizeState,
  projectState,
  tableKeys,
  type SqlRow,
} from "../db/state-mapping.js";

const quote = (name: string) => `"${name}"`;
export async function readSqlState(client: PoolClient, tenant: string) {
  const tables: Record<string, SqlRow[]> = {};
  for (const table of Object.keys(tableKeys))
    tables[table] = (
      await client.query(`SELECT * FROM ${quote(table)} WHERE tenant_id=$1`, [
        tenant,
      ])
    ).rows;
  return hydrateState(tables, tenant);
}
export async function writeSqlState(
  client: PoolClient,
  tenant: string,
  next: Db,
  before?: Db,
) {
  const rows = projectState(next, tenant);
  const previous = before ? projectState(before, tenant) : {};
  const identity = (row: SqlRow, keys: string[]) =>
    canonical(keys.map((key) => row[key]));
  for (const table of Object.keys(tableKeys).reverse()) {
    const keys = tableKeys[table];
    const retained = new Set(rows[table].map((row) => identity(row, keys)));
    for (const row of previous[table] ?? []) {
      if (retained.has(identity(row, keys))) continue;
      if (table === "audit_events")
        throw new Error("AUDIT_EVENTS_ARE_APPEND_ONLY");
      await client.query(
        `DELETE FROM ${quote(table)} WHERE ${keys.map((key, index) => `${quote(key)}=$${index + 1}`).join(" AND ")}`,
        keys.map((key) => row[key]),
      );
    }
  }
  for (const [table, entries] of Object.entries(rows)) {
    const keys = tableKeys[table];
    const previousRows = new Map(
      (previous[table] ?? []).map((row) => [identity(row, keys), row]),
    );
    for (const row of entries) {
      const saved = previousRows.get(identity(row, keys));
      if (saved && canonical(saved) === canonical(row)) continue;
      // Position is presentation order, never permission to rewrite an audit payload.
      if (
        saved &&
        table === "audit_events" &&
        canonical({ ...saved, position: 0 }) !==
          canonical({ ...row, position: 0 })
      )
        throw new Error("AUDIT_EVENTS_ARE_APPEND_ONLY");
      const columns = Object.keys(row);
      const values = columns.map((column) => {
        const value = row[column];
        return jsonColumns.has(column) &&
          !(table === "permission_rules" && column === "values") &&
          value !== null
          ? JSON.stringify(value)
          : value;
      });
      const updates = columns
        .filter((column) => !keys.includes(column))
        .map((column) => `${quote(column)}=EXCLUDED.${quote(column)}`);
      await client.query(
        `INSERT INTO ${quote(table)}(${columns.map(quote).join(",")}) VALUES(${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT(${keys.map(quote).join(",")}) DO UPDATE SET ${updates.join(",")}`,
        values,
      );
    }
  }
}
/** Existing synchronous domain mutations run once under a same-tenant row lock.
 * No cache, seed fallback, auto-migration, or automatic retry of arbitrary callbacks.
 */
export class PostgresRepository implements StateRepository {
  constructor(
    private readonly pool: Pool,
    readonly tenantId: string,
    readonly schema = "zhixu",
  ) {}
  load(): Promise<Db> {
    return transaction(this.pool, this.schema, false, async (client) => {
      const tenant = await client.query(
        "SELECT status FROM tenants WHERE id=$1",
        [this.tenantId],
      );
      if (tenant.rows[0]?.status !== "active")
        throw new Error("TENANT_NOT_AVAILABLE");
      return readSqlState(client, this.tenantId);
    });
  }
  update<T>(change: (db: Db) => T): Promise<T> {
    return transaction(this.pool, this.schema, true, async (client) => {
      const tenant = await client.query(
        "SELECT status FROM tenants WHERE id=$1 FOR UPDATE",
        [this.tenantId],
      );
      if (tenant.rows[0]?.status !== "active")
        throw new Error("TENANT_NOT_AVAILABLE");
      const before = await readSqlState(client, this.tenantId);
      const next = structuredClone(before);
      const result = change(next);
      if (result && typeof result === "object" && "then" in result)
        throw new Error("ASYNC_MUTATION_NOT_SUPPORTED");
      await writeSqlState(
        client,
        this.tenantId,
        normalizeState(next, this.tenantId),
        before,
      );
      await client.query("UPDATE tenants SET name=$2 WHERE id=$1", [
        this.tenantId,
        next.settings.workspace,
      ]);
      return result;
    });
  }
}
