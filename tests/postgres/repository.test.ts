import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createSeedDb } from "../../server/data/seed";
import { migrateCore, schemaName, useSchema } from "../../server/db/session";
import { canonical, normalizeState } from "../../server/db/state-mapping";
import { dryRunPostgres } from "../../server/db/dry-run";
import {
  PostgresRepository,
  writeSqlState,
} from "../../server/repositories/postgres";
import { createApp } from "../../server/app";
import { JobQueue, scheduleText } from "../../server/jobs/queue";
import { runOne } from "../../server/jobs/worker";

async function fixture(
  run: (context: {
    pool: Pool;
    schema: string;
    tenant: string;
    repository: PostgresRepository;
  }) => Promise<void>,
) {
  if (!process.env.ZHIXU_TEST_DATABASE_URL)
    throw new Error("USE_NPM_RUN_TEST_POSTGRES");
  const pool = new Pool({
    connectionString: process.env.ZHIXU_TEST_DATABASE_URL,
    max: 8,
  });
  const schema = `zhixu_test_${randomUUID().replaceAll("-", "")}`;
  const db = createSeedDb();
  const tenant = db.settings.tenant;
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
  try {
    await run({
      pool,
      schema,
      tenant,
      repository: new PostgresRepository(pool, tenant, schema),
    });
  } finally {
    await pool.query(`DROP SCHEMA ${schemaName(schema)} CASCADE`);
    await pool.end();
  }
}

it("round-trips normalized relations and unknown fields, with independently stored versions/chunks/messages", () =>
  fixture(async ({ repository, pool, schema, tenant }) => {
    expect(await repository.load()).toEqual(
      normalizeState(createSeedDb(), tenant),
    );
    await repository.update((db) => {
      Object.assign(db, { futureExtension: { preserved: true } });
      db.bases[0].description = "updated";
    });
    const restarted = new PostgresRepository(pool, tenant, schema);
    expect((await restarted.load()).bases[0].description).toBe("updated");
    expect(await restarted.load()).toMatchObject({
      futureExtension: { preserved: true },
    });
    expect(
      Number(
        (
          await pool.query(
            `SELECT count(*) AS n FROM ${schemaName(schema)}.chunks`,
          )
        ).rows[0].n,
      ),
    ).toBeGreaterThan(0);
    expect(
      Number(
        (
          await pool.query(
            `SELECT count(*) AS n FROM ${schemaName(schema)}.messages`,
          )
        ).rows[0].n,
      ),
    ).toBeGreaterThan(0);
  }));

it("serializes independent writers without losing updates, and rolls back thrown mutations without retrying callbacks", () =>
  fixture(async ({ repository, pool, schema, tenant }) => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        new PostgresRepository(pool, tenant, schema).update((db) => {
          db.bases.push({
            ...db.bases[0],
            id: `concurrent-${index}`,
            name: `concurrent-${index}`,
          });
        }),
      ),
    );
    expect((await repository.load()).bases).toHaveLength(12);
    const before = canonical(await repository.load());
    let calls = 0;
    await expect(
      repository.update((db) => {
        calls++;
        db.bases = [];
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(calls).toBe(1);
    expect(canonical(await repository.load())).toBe(before);
  }));

it("enforces same-tenant foreign keys and normalized uniqueness, and preserves committed state on constraint failure", () =>
  fixture(async ({ repository, pool, schema, tenant }) => {
    const before = canonical(await repository.load());
    await expect(
      repository.update((db) => {
        db.bases[1].name = db.bases[0].name;
      }),
    ).rejects.toThrow();
    expect(canonical(await repository.load())).toBe(before);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await useSchema(client, schema);
      const normalized = await client.query(
        "SELECT normalized_name FROM knowledge_bases WHERE tenant_id=$1 AND id='b1'",
        [tenant],
      );
      await expect(
        client.query(
          "UPDATE knowledge_bases SET normalized_name=$2 WHERE tenant_id=$1 AND id='b2'",
          [tenant, normalized.rows[0].normalized_name],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await useSchema(client, schema);
      await client.query(
        "INSERT INTO tenants(id,name) VALUES('other-tenant','Other')",
      );
      await client.query(
        "UPDATE documents SET tenant_id='other-tenant' WHERE tenant_id=$1 AND id='d1'",
        [tenant],
      );
      await expect(
        client.query("SET CONSTRAINTS ALL IMMEDIATE"),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect(canonical(await repository.load())).toBe(before);
  }));

it("refuses changed migration checksums and suspended tenants without seed fallback", () =>
  fixture(async ({ pool, schema, repository, tenant }) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await useSchema(client, schema);
      await client.query("UPDATE schema_migrations SET checksum='changed'");
      await expect(migrateCore(client, schema)).rejects.toThrow(
        "DATABASE_MIGRATION_VERSION_MISMATCH",
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    await pool.query(
      `UPDATE ${schemaName(schema)}.tenants SET status='suspended' WHERE id=$1`,
      [tenant],
    );
    await expect(repository.load()).rejects.toThrow("TENANT_NOT_AVAILABLE");
    await expect(
      repository.update((db) => {
        db.bases = [];
      }),
    ).rejects.toThrow("TENANT_NOT_AVAILABLE");
  }));

it("rolls back a partial SQL mutation when a later constraint fails", () =>
  fixture(async ({ pool, schema, repository, tenant }) => {
    const before = canonical(await repository.load());
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await useSchema(client, schema);
      await client.query(
        "UPDATE knowledge_bases SET name='temporary-uncommitted' WHERE tenant_id=$1 AND id='b1'",
        [tenant],
      );
      await expect(
        client.query(
          "UPDATE document_working_chunks SET ordinal=-1 WHERE tenant_id=$1",
          [tenant],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect(canonical(await repository.load())).toBe(before);
  }));

it("isolates tenant snapshots without cached state and never initializes an unknown tenant", () =>
  fixture(async ({ repository, pool, schema, tenant }) => {
    const other = createSeedDb();
    other.settings.tenant = "isolated-tenant";
    other.bases[0].name = "Isolated base";
    other.documents
      .filter((doc) => doc.category === "企业制度")
      .forEach((doc) => {
        doc.category = "Isolated base";
      });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await useSchema(client, schema);
      await client.query("INSERT INTO tenants(id,name) VALUES($1,'Other')", [
        other.settings.tenant,
      ]);
      await writeSqlState(client, other.settings.tenant, other);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect(
      (await new PostgresRepository(pool, other.settings.tenant, schema).load())
        .bases[0].name,
    ).toBe("Isolated base");
    expect((await repository.load()).settings.tenant).toBe(tenant);
    expect((await repository.load()).bases[0].name).toBe("企业制度");
    await expect(
      new PostgresRepository(pool, "unknown-tenant", schema).load(),
    ).rejects.toThrow("TENANT_NOT_AVAILABLE");
  }));

it("uses existing API idempotency and worker checkpoints against real SQL, and prevents audit payload rewriting", () =>
  fixture(async ({ repository, pool, schema, tenant }) => {
    const app = createApp(repository);
    const request = () =>
      app.request("/api/knowledge/bases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "postgres-replay-12345",
        },
        body: JSON.stringify({ name: "SQL persisted base" }),
      });
    const created = await request();
    expect(created.status).toBe(201);
    const replay = await request();
    expect(replay.status).toBe(201);
    expect((await replay.json()).base.id).toBe((await created.json()).base.id);
    const taskId = await repository.update(
      (db) => scheduleText(db, db.documents[0], "actual persisted SQL text").id,
    );
    const restarted = new PostgresRepository(pool, tenant, schema);
    expect(await runOne(new JobQueue(restarted))).toBe(true);
    expect(
      (await restarted.load()).tasks.find((task) => task.id === taskId)?.job
        ?.state,
    ).toBe("succeeded");
    const audit = canonical((await restarted.load()).auditLogs);
    await expect(
      restarted.update((db) => {
        db.auditLogs[0].content = "rewrite";
      }),
    ).rejects.toThrow("AUDIT_EVENTS_ARE_APPEND_ONLY");
    expect(canonical((await restarted.load()).auditLogs)).toBe(audit);
  }));

it("rolls back all dry-run DDL/data, refuses existing schemas, and leaves source bytes unchanged through the real CLI", () =>
  fixture(async ({ pool, tenant }) => {
    const schema = `zhixu_dryrun_${randomUUID().replaceAll("-", "")}`;
    const report = await dryRunPostgres(pool, createSeedDb(), tenant, schema);
    expect(report).toMatchObject({
      sqlIntegrity: "passed",
      rolledBack: true,
      cutoverReady: false,
    });
    expect(report.counts.documents).toBe(8);
    expect(
      (
        await pool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schema,
        ])
      ).rowCount,
    ).toBe(0);
    await pool.query(`CREATE SCHEMA ${schemaName(schema)}`);
    try {
      await expect(
        dryRunPostgres(pool, createSeedDb(), tenant, schema),
      ).rejects.toThrow("DRY_RUN_SCHEMA_ALREADY_EXISTS");
    } finally {
      await pool.query(`DROP SCHEMA ${schemaName(schema)}`);
    }
    const dir = await mkdtemp(join(tmpdir(), "zhixu-sql-copy-"));
    try {
      const input = join(dir, "copy.json");
      const original = JSON.stringify(createSeedDb());
      await writeFile(input, original);
      const result = await promisify(execFile)(
        process.execPath,
        [
          "node_modules/tsx/dist/cli.mjs",
          "scripts/migrate-data.ts",
          "--input",
          input,
          "--tenant",
          tenant,
          "--connection-env",
          "ZHIXU_TEST_DATABASE_URL",
        ],
        { env: process.env },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        sqlIntegrity: "passed",
        rolledBack: true,
        cutoverReady: false,
      });
      expect(result.stderr).toBe("");
      expect(await readFile(input, "utf8")).toBe(original);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }));
