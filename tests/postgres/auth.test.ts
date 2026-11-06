import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createSeedDb } from "../../server/data/seed";
import { migrateCore, schemaName, useSchema } from "../../server/db/session";
import {
  writeSqlState,
  PostgresRepository,
} from "../../server/repositories/postgres";
import { createAuthenticatedApp } from "../../server/auth/app";
import { AuthService, digestToken } from "../../server/auth/service";
import { FileStore } from "../../server/services/files";
import { JobQueue } from "../../server/jobs/queue";
import { runOne } from "../../server/jobs/worker";

const password = "fixture-password-2026";
type Login = { cookie: string; csrf: string; id: string; user: string };
async function fixture(
  run: (context: {
    pool: Pool;
    schema: string;
    auth: AuthService;
    app: ReturnType<typeof createAuthenticatedApp>;
    repository: PostgresRepository;
    admin: Login;
    login: (email: string) => Promise<Login>;
    directory: string;
  }) => Promise<void>,
) {
  if (!process.env.ZHIXU_TEST_DATABASE_URL)
    throw new Error("USE_NPM_RUN_TEST_POSTGRES");
  const schema = `zhixu_test_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: process.env.ZHIXU_TEST_DATABASE_URL,
    max: 8,
    application_name: schema,
  });
  const directory = await mkdtemp(join(tmpdir(), "zhixu-auth-"));
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
  const auth = new AuthService(pool, schema, tenant);
  const app = createAuthenticatedApp(auth, {
    secureCookies: false,
    files: new FileStore(join(directory, "files")),
  });
  const login = async (email: string): Promise<Login> => {
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    return {
      cookie: response.headers.get("Set-Cookie")!.split(";")[0],
      csrf: body.csrfToken,
      id: body.user.memberId,
      user: body.user.userId,
    };
  };
  try {
    await auth.bootstrap({
      email: "admin@fixture.test",
      name: "Fixture admin",
      password,
    });
    await run({
      pool,
      schema,
      auth,
      app,
      repository: new PostgresRepository(pool, tenant, schema),
      admin: await login("admin@fixture.test"),
      login,
      directory,
    });
  } finally {
    await pool.query(`DROP SCHEMA ${schemaName(schema)} CASCADE`);
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
}
async function request(
  app: ReturnType<typeof createAuthenticatedApp>,
  login: Login,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  return app.request(path, {
    method,
    headers: {
      Cookie: login.cookie,
      Origin: "http://localhost",
      "X-CSRF-Token": login.csrf,
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function grant(
  app: ReturnType<typeof createAuthenticatedApp>,
  admin: Login,
  baseId: string,
  grants: { memberId: string; permissions: string[] }[],
) {
  const bases = await (
    await request(app, admin, "/api/knowledge/bases")
  ).json();
  const base = bases.bases.find((base: { id: string }) => base.id === baseId);
  const response = await request(
    app,
    admin,
    `/api/knowledge/bases/${baseId}/grants`,
    "PUT",
    { revision: base.revision, grants },
  );
  expect(response.status).toBe(200);
}

it("stores password and token hashes, requires real sessions/CSRF, revokes logout and rejects self-asserted identity headers", () =>
  fixture(async ({ pool, schema, app, admin }) => {
    const stored = await pool.query(
      `SELECT password_hash FROM ${schemaName(schema)}.auth_identities`,
    );
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(stored.rows[0].password_hash).not.toContain(password);
    const token = admin.cookie.split("=")[1];
    const session = (
      await pool.query(
        `SELECT token_hash FROM ${schemaName(schema)}.auth_sessions`,
      )
    ).rows[0];
    expect(session.token_hash).toBe(digestToken(token));
    expect(session.token_hash).not.toBe(token);
    const anonymous = await app.request("/api/knowledge/documents", {
      headers: { "X-User-ID": admin.user },
    });
    expect(anonymous.status).toBe(401);
    const noCsrf = await app.request("/api/conversations", {
      method: "POST",
      headers: {
        Cookie: admin.cookie,
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.clone().json()).requestId).toBe(
      noCsrf.headers.get("X-Request-ID"),
    );
    const badOrigin = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "https://untrusted.invalid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "admin@fixture.test", password }),
    });
    expect(badOrigin.status).toBe(403);
    expect(
      (await request(app, admin, "/api/auth/logout", "POST", {})).status,
    ).toBe(200);
    expect((await request(app, admin, "/api/auth/me")).status).toBe(401);
  }));

it("does not turn legacy members into accounts or give the workspace administrator implicit document read", () =>
  fixture(async ({ app, admin, auth, pool, schema }) => {
    expect(
      (await (await request(app, admin, "/api/knowledge/documents")).json())
        .documents,
    ).toEqual([]);
    expect(
      (await request(app, admin, "/api/knowledge/documents/d1")).status,
    ).toBe(404);
    const access = await (await request(app, admin, "/api/auth/access")).json();
    expect(access.members).toHaveLength(1);
    expect(access.grants).toEqual([]);
    await expect(
      auth.bootstrap({ email: "other@fixture.test", name: "Other", password }),
    ).rejects.toMatchObject({ code: "BOOTSTRAP_ALREADY_USED" });
    const last = await request(
      app,
      admin,
      `/api/auth/members/${admin.id}`,
      "PATCH",
      { revision: 1, role: "viewer", status: "active" },
    );
    expect(last.status).toBe(409);
    expect((await request(app, admin, "/api/auth/me")).status).toBe(200);
    expect(
      (await (await request(app, admin, "/api/overview")).json()).stats.members,
    ).toBe(1);
    const second = await request(app, admin, "/api/auth/members", "POST", {
      email: "disabled-admin@fixture.test",
      name: "Disabled global user",
      password,
      role: "admin",
    });
    const secondId = (await second.json()).memberId;
    await pool.query(
      `UPDATE ${schemaName(schema)}.users SET status='disabled' WHERE id=(SELECT user_id FROM ${schemaName(schema)}.memberships WHERE id=$1)`,
      [secondId],
    );
    const stillLast = await request(
      app,
      admin,
      `/api/auth/members/${admin.id}`,
      "PATCH",
      { revision: 1, role: "viewer", status: "active" },
    );
    expect(stillLast.status).toBe(409);
    expect(
      (
        await request(app, admin, "/api/knowledge/bases/constructor", "PUT", {
          revision: 1,
          name: "invalid identity",
        })
      ).status,
    ).toBe(403);
  }));

it("enforces reader grants on lists, details, retrieval, tasks and originals while preserving hidden records on writes", () =>
  fixture(async ({ app, admin, login, repository }) => {
    const created = await request(app, admin, "/api/auth/members", "POST", {
      email: "viewer@fixture.test",
      name: "Viewer",
      password,
      role: "viewer",
    });
    expect(created.status).toBe(201);
    const viewer = await login("viewer@fixture.test");
    await grant(app, admin, "b1", [
      { memberId: viewer.id, permissions: ["read"] },
    ]);
    const docs = (
      await (await request(app, viewer, "/api/knowledge/documents")).json()
    ).documents;
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.every((doc: { baseId: string }) => doc.baseId === "b1")).toBe(
      true,
    );
    expect(
      (await request(app, viewer, "/api/knowledge/documents/d3")).status,
    ).toBe(404);
    expect(
      (
        await request(app, viewer, "/api/knowledge/documents/d1", "PUT", {
          revision: 1,
          name: "not allowed",
        })
      ).status,
    ).toBe(403);
    const retrieval = await (
      await request(app, viewer, "/api/retrieval/search", "POST", {
        query: "年假",
      })
    ).json();
    expect(
      retrieval.trace.hits.every(
        (hit: { scope: string }) => hit.scope === "企业制度",
      ),
    ).toBe(true);
    const before = (await repository.load()).documents.length;
    expect(
      (
        await request(app, viewer, "/api/conversations", "POST", {
          title: "Reader own conversation",
        })
      ).status,
    ).toBe(201);
    expect((await repository.load()).documents).toHaveLength(before);
    expect((await request(app, viewer, "/api/auth/access")).status).toBe(403);
    expect(
      (await request(app, viewer, "/api/knowledge/tasks/t3/events")).status,
    ).toBe(404);
  }));

it("checks role caps and fresh grants inside mutations including idempotent replays, without granting a spoofed owner", () =>
  fixture(async ({ app, admin, login }) => {
    await request(app, admin, "/api/auth/members", "POST", {
      email: "editor@fixture.test",
      name: "Editor",
      password,
      role: "editor",
    });
    const editor = await login("editor@fixture.test");
    const invalid = await request(
      app,
      admin,
      "/api/knowledge/bases/b1/grants",
      "PUT",
      {
        revision: 1,
        grants: [{ memberId: editor.id, permissions: ["publish"] }],
      },
    );
    expect(invalid.status).toBe(400);
    await grant(app, admin, "b1", [
      { memberId: editor.id, permissions: ["read", "write"] },
    ]);
    const docs = await (
      await request(app, editor, "/api/knowledge/documents/d1")
    ).json();
    const input = {
      revision: docs.document.revision,
      name: "Edited by actual account",
    };
    const key = "auth-replay-safe-12345";
    expect(
      (
        await request(
          app,
          editor,
          "/api/knowledge/documents/d1",
          "PUT",
          input,
          key,
        )
      ).status,
    ).toBe(200);
    await grant(app, admin, "b1", []);
    expect(
      (
        await request(
          app,
          editor,
          "/api/knowledge/documents/d1",
          "PUT",
          input,
          key,
        )
      ).status,
    ).toBe(403);
    const conversation = (
      await (
        await request(app, editor, "/api/conversations", "POST", {
          title: "Private",
        })
      ).json()
    ).conversation;
    expect(
      (await request(app, admin, `/api/conversations/${conversation.id}`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          app,
          admin,
          `/api/conversations/${conversation.id}/messages`,
          "POST",
          { content: "read another person's conversation" },
        )
      ).status,
    ).toBe(404);
  }));

it("keeps draft edits private until explicit publish and filters previously saved chat retrieval after revocation", () =>
  fixture(async ({ app, admin, login, repository }) => {
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
    ]);
    await request(app, admin, "/api/auth/members", "POST", {
      email: "reader@fixture.test",
      name: "Reader",
      password,
      role: "viewer",
    });
    const reader = await login("reader@fixture.test");
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
      { memberId: reader.id, permissions: ["read"] },
    ]);
    const old = (
      await (await request(app, reader, "/api/knowledge/documents/d1")).json()
    ).document;
    const current = (
      await (await request(app, admin, "/api/knowledge/documents/d1")).json()
    ).document;
    const changed = [...current.chunks];
    changed[0] = "private draft evidence only";
    const edited = await request(
      app,
      admin,
      "/api/knowledge/documents/d1/chunks",
      "PUT",
      { revision: current.revision, chunks: changed },
    );
    expect(edited.status).toBe(200);
    await runOne(new JobQueue(repository));
    const renamed = (
      await (await request(app, admin, "/api/knowledge/documents/d1")).json()
    ).document;
    expect(
      (
        await request(app, admin, "/api/knowledge/documents/d1", "PUT", {
          revision: renamed.revision,
          name: "Unpublished private title",
        })
      ).status,
    ).toBe(200);
    const after = (
      await (await request(app, reader, "/api/knowledge/documents/d1")).json()
    ).document;
    expect(after.chunks).toEqual(old.chunks);
    expect(after.name).toBe(old.name);
    expect(after.versions).toHaveLength(1);
    const draft = (
      await (await request(app, admin, "/api/knowledge/documents/d1")).json()
    ).document;
    expect(
      (
        await request(
          app,
          admin,
          "/api/knowledge/documents/d1/publish",
          "POST",
          { revision: draft.revision },
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await request(app, reader, "/api/knowledge/documents/d1")).json())
        .document.chunks[0],
    ).toBe(changed[0]);
    expect(
      (await (await request(app, reader, "/api/knowledge/documents/d1")).json())
        .document.name,
    ).toBe("Unpublished private title");
    const conversation = (
      await (
        await request(app, reader, "/api/conversations", "POST", {
          title: "My read",
        })
      ).json()
    ).conversation;
    const answer = await request(
      app,
      reader,
      `/api/conversations/${conversation.id}/messages`,
      "POST",
      { content: "private draft evidence" },
    );
    expect(answer.status).toBe(200);
    expect(
      (await answer.json()).answerMessage.retrieval.hits.length,
    ).toBeGreaterThan(0);
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
    ]);
    const history = (
      await (
        await request(app, reader, `/api/conversations/${conversation.id}`)
      ).json()
    ).conversation;
    expect(
      JSON.stringify(
        history.messages.filter(
          (message: { role: string }) => message.role === "assistant",
        ),
      ),
    ).not.toContain("private draft evidence only");
    expect(history.messages.at(-1).content).toContain("访问权限已变更");
  }));

it("expires and disables sessions, bounds unknown-account attempts, and rejects cross-tenant sessions and grants", () =>
  fixture(async ({ pool, schema, app, admin, auth, login }) => {
    await request(app, admin, "/api/auth/members", "POST", {
      email: "temporary@fixture.test",
      name: "Temporary",
      password,
      role: "viewer",
    });
    const member = await login("temporary@fixture.test");
    expect(
      (
        await request(app, admin, `/api/auth/members/${member.id}`, "PATCH", {
          revision: 1,
          role: "viewer",
          status: "disabled",
        })
      ).status,
    ).toBe(200);
    expect((await request(app, member, "/api/auth/me")).status).toBe(401);
    const other = createSeedDb();
    other.settings.tenant = "other-auth-tenant";
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
    const service = new AuthService(pool, schema, other.settings.tenant);
    const otherId = await service.bootstrap({
      email: "other-admin@fixture.test",
      name: "Other Admin",
      password,
    });
    const otherSession = await service.login(
      "other-admin@fixture.test",
      password,
    );
    const foreign = await app.request("/api/auth/me", {
      headers: { Cookie: `zhixu_session_local=${otherSession.token}` },
    });
    expect(foreign.status).toBe(401);
    const wrongGrant = await request(
      app,
      admin,
      "/api/knowledge/bases/b1/grants",
      "PUT",
      { revision: 1, grants: [{ memberId: otherId, permissions: ["read"] }] },
    );
    expect(wrongGrant.status).toBe(400);
    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "unknown@fixture.test",
          password: "wrong-password",
        }),
      });
      expect(failed.status).toBe(401);
      expect((await failed.json()).code).toBe("INVALID_CREDENTIALS");
    }
    const limited = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "unknown@fixture.test",
        password: "wrong-password",
      }),
    });
    expect(limited.status).toBe(429);
    expect(
      JSON.stringify(
        (await pool.query(`SELECT * FROM ${schemaName(schema)}.login_attempts`))
          .rows,
      ),
    ).not.toContain("unknown@fixture.test");
    await pool.query(
      `UPDATE ${schemaName(schema)}.auth_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1`,
      [digestToken(admin.cookie.split("=")[1])],
    );
    expect((await request(app, admin, "/api/auth/me")).status).toBe(401);
  }));

it("rejects untrusted requests before reading bodies while retaining upload and login limits", () =>
  fixture(async ({ app, admin }) => {
    const cases = [
      {
        path: "/api/knowledge/files",
        headers: { Origin: "http://localhost" },
        status: 401,
      },
      {
        path: "/api/knowledge/files",
        headers: { Origin: "http://localhost", Cookie: admin.cookie },
        status: 403,
      },
      {
        path: "/api/auth/login",
        headers: { Origin: "https://untrusted.invalid" },
        status: 403,
      },
    ];
    for (const test of cases) {
      let reads = 0;
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            reads++;
            controller.enqueue(
              new TextEncoder().encode("private request body"),
            );
            controller.close();
          },
        },
        { highWaterMark: 0 },
      );
      const input = new Request(`http://localhost${test.path}`, {
        method: "POST",
        headers: test.headers,
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      try {
        expect((await app.fetch(input)).status).toBe(test.status);
        expect(reads).toBe(0);
      } finally {
        if (!input.body?.locked) await input.body?.cancel();
      }
    }
    for (const path of ["/api/knowledge/files", "/api/auth/login"]) {
      const response = await app.request(path, {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: admin.cookie,
          "X-CSRF-Token": admin.csrf,
          "Content-Length": String(25 * 1024 * 1024),
        },
        body: "oversize declared body",
      });
      expect(response.status).toBe(413);
    }
  }));

it("namespaces uploaded metadata by actual uploader and rechecks linked-original permissions", () =>
  fixture(async ({ app, admin, login, repository, directory }) => {
    await request(app, admin, "/api/auth/members", "POST", {
      email: "no-upload@fixture.test",
      name: "No upload permission",
      password,
      role: "viewer",
    });
    const viewer = await login("no-upload@fixture.test");
    const deniedFile = new FormData();
    deniedFile.append(
      "file",
      new File(["must not be persisted"], "unauthorized.txt"),
    );
    const refused = await app.request("/api/knowledge/files", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        Cookie: viewer.cookie,
        "X-CSRF-Token": viewer.csrf,
      },
      body: deniedFile,
    });
    expect(refused.status).toBe(403);
    const blobs = await readdir(join(directory, "files")).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    expect(blobs).toEqual([]);
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
    ]);
    await request(app, admin, "/api/auth/members", "POST", {
      email: "uploader@fixture.test",
      name: "Uploader",
      password,
      role: "editor",
    });
    const uploader = await login("uploader@fixture.test");
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
      { memberId: uploader.id, permissions: ["read", "write"] },
    ]);
    const upload = async (session: Login) => {
      const form = new FormData();
      form.append("file", new File(["scoped original bytes"], "scoped.txt"));
      const response = await app.request("/api/knowledge/files", {
        method: "POST",
        headers: {
          Cookie: session.cookie,
          Origin: "http://localhost",
          "X-CSRF-Token": session.csrf,
        },
        body: form,
      });
      expect(response.status).toBe(201);
      return (await response.json()).artifact;
    };
    const mine = await upload(admin),
      theirs = await upload(uploader);
    expect(mine.sha256).toBe(theirs.sha256);
    expect(mine.id).not.toBe(theirs.id);
    expect(mine.uploaderMembershipId).toBe(admin.id);
    expect(
      (
        await request(
          app,
          uploader,
          "/api/knowledge/documents/import",
          "POST",
          {
            mode: "file",
            name: "stolen reference",
            baseId: "b1",
            artifactId: mine.id,
          },
        )
      ).status,
    ).toBe(403);
    const imported = await request(
      app,
      admin,
      "/api/knowledge/documents/import",
      "POST",
      {
        mode: "file",
        name: "Scoped original",
        baseId: "b1",
        artifactId: mine.id,
      },
    );
    expect(imported.status).toBe(201);
    const id = (await imported.json()).document.id;
    await runOne(new JobQueue(repository));
    const prepared = (
      await (await request(app, admin, `/api/knowledge/documents/${id}`)).json()
    ).document;
    expect(
      (
        await request(
          app,
          admin,
          `/api/knowledge/documents/${id}/publish`,
          "POST",
          { revision: prepared.revision },
        )
      ).status,
    ).toBe(200);
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
      { memberId: uploader.id, permissions: ["read"] },
    ]);
    expect(
      await (
        await request(app, uploader, `/api/knowledge/files/${mine.id}/download`)
      ).text(),
    ).toBe("scoped original bytes");
    await grant(app, admin, "b1", [
      {
        memberId: admin.id,
        permissions: ["read", "write", "publish", "manage"],
      },
    ]);
    expect(
      (await request(app, uploader, `/api/knowledge/files/${mine.id}/download`))
        .status,
    ).toBe(404);
  }));

it("bootstraps a real empty workspace through the CLI without default accounts, demo records, or overwriting an existing workspace", () =>
  fixture(async ({ pool }) => {
    const schema = `zhixu_test_${randomUUID().replaceAll("-", "")}`,
      tenant = "cli-empty-tenant";
    const args = [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/init-local-auth.ts",
      "--connection-env",
      "ZHIXU_TEST_DATABASE_URL",
      "--tenant",
      tenant,
      "--schema",
      schema,
      "--email",
      "cli@fixture.test",
      "--name",
      "CLI Admin",
      "--create-empty-workspace",
      "--workspace",
      "Empty Workspace",
    ];
    try {
      const result = await promisify(execFile)(process.execPath, args, {
        env: { ...process.env, ZHIXU_BOOTSTRAP_PASSWORD: password },
      });
      expect(JSON.parse(result.stdout)).toMatchObject({
        created: true,
        automaticContentGrants: false,
      });
      expect(result.stdout).not.toContain(password);
      expect(result.stderr).toBe("");
      const repository = new PostgresRepository(pool, tenant, schema);
      expect((await repository.load()).documents).toEqual([]);
      expect((await repository.load()).members).toEqual([]);
      expect((await repository.load()).bases).toEqual([]);
      const auth = new AuthService(pool, schema, tenant);
      expect(
        (await auth.login("cli@fixture.test", password)).principal.role,
      ).toBe("admin");
      await expect(
        promisify(execFile)(process.execPath, args, {
          env: { ...process.env, ZHIXU_BOOTSTRAP_PASSWORD: password },
        }),
      ).rejects.toMatchObject({ code: 1 });
      expect(
        (
          await pool.query(
            `SELECT count(*) AS n FROM ${schemaName(schema)}.memberships`,
          )
        ).rows[0].n,
      ).toBe("1");
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schemaName(schema)} CASCADE`);
    }
  }));

it("keeps hidden document relations intact for library managers and returns redacted receipts when an action removes read visibility", () =>
  fixture(async ({ app, admin, repository }) => {
    await grant(app, admin, "b1", [
      { memberId: admin.id, permissions: ["manage"] },
    ]);
    const deletion = await request(
      app,
      admin,
      "/api/knowledge/bases/b1",
      "DELETE",
    );
    expect(deletion.status).toBe(409);
    expect((await deletion.json()).code).toBe("RESOURCE_NOT_EMPTY");
    const bases = (
      await (await request(app, admin, "/api/knowledge/bases")).json()
    ).bases;
    const base = bases.find((base: { id: string }) => base.id === "b1");
    expect(
      (
        await request(app, admin, "/api/knowledge/bases/b1", "PUT", {
          revision: base.revision,
          name: "Renamed without content access",
        })
      ).status,
    ).toBe(200);
    expect(
      (await repository.load()).documents
        .filter((doc) => doc.baseId === "b1")
        .every((doc) => doc.category === "Renamed without content access"),
    ).toBe(true);
    expect(
      (await request(app, admin, "/api/knowledge/documents/d1")).status,
    ).toBe(404);
    await grant(app, admin, "b1", [
      { memberId: admin.id, permissions: ["read", "publish"] },
    ]);
    const doc = (
      await (await request(app, admin, "/api/knowledge/documents/d1")).json()
    ).document;
    const archived = await request(
      app,
      admin,
      "/api/knowledge/documents/d1/archive",
      "POST",
      { revision: doc.revision },
    );
    expect(archived.status).toBe(200);
    const receipt = (await archived.json()).document;
    expect(receipt).toMatchObject({
      id: "d1",
      redacted: true,
      status: "已归档",
      chunks: [],
      versions: [],
    });
    expect(JSON.stringify(receipt)).not.toContain(doc.chunks[0]);
    expect(
      (await request(app, admin, "/api/knowledge/documents/d1")).status,
    ).toBe(404);
    const events = await (await request(app, admin, "/api/auth/events")).json();
    expect(
      events.events.some(
        (event: { request_id: string | null; http_status: number | null }) =>
          event.request_id === archived.headers.get("X-Request-ID") &&
          event.http_status === 200,
      ),
    ).toBe(true);
  }));

it("changes only the authenticated user's password, checks the old credential and revokes every prior session atomically", () =>
  fixture(async ({ app, admin, auth, login, pool, schema }) => {
    const second = await login("admin@fixture.test");
    const wrong = await request(app, admin, "/api/auth/password", "POST", {
      currentPassword: "wrong password",
      newPassword: "rotated-private-password-2026",
    });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).code).toBe("CURRENT_PASSWORD_INVALID");
    expect((await request(app, admin, "/api/auth/me")).status).toBe(200);
    const changed = await request(app, admin, "/api/auth/password", "POST", {
      currentPassword: password,
      newPassword: "rotated-private-password-2026",
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await request(app, admin, "/api/auth/me")).status).toBe(401);
    expect((await request(app, second, "/api/auth/me")).status).toBe(401);
    await expect(
      auth.login("admin@fixture.test", password),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(
      (await auth.login("admin@fixture.test", "rotated-private-password-2026"))
        .principal.memberId,
    ).toBe(admin.id);
    const events = JSON.stringify(
      (await pool.query(`SELECT * FROM ${schemaName(schema)}.auth_events`))
        .rows,
    );
    expect(events).not.toContain(password);
    expect(events).not.toContain("rotated-private-password-2026");
  }));

it("rechecks revoked grants after a request waits on the tenant transaction lock", () =>
  fixture(async ({ app, admin, login, repository, pool, schema, auth }) => {
    await request(app, admin, "/api/auth/members", "POST", {
      email: "waiting-editor@fixture.test",
      name: "Waiting editor",
      password,
      role: "editor",
    });
    const editor = await login("waiting-editor@fixture.test");
    await grant(app, admin, "b1", [
      { memberId: editor.id, permissions: ["read", "write"] },
    ]);
    const original = (await repository.load()).documents.find(
      (doc) => doc.id === "d1",
    )!;
    const blocker = await pool.connect();
    let committed = false;
    let pending: Promise<Response>;
    try {
      await blocker.query("BEGIN");
      await useSchema(blocker, schema);
      await blocker.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        auth.tenantId,
      ]);
      const own = (await blocker.query("SELECT pg_backend_pid() AS pid"))
        .rows[0].pid;
      pending = request(
        app,
        editor,
        "/api/knowledge/documents/d1",
        "PUT",
        {
          revision: original.revision,
          name: "must never commit after revocation",
        },
        "waiting-revoked-request-12345",
      );
      let waiting = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        const rows = await pool.query(
          "SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND pid<>$2 AND wait_event_type='Lock'",
          [schema, own],
        );
        if (rows.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await blocker.query(
        "DELETE FROM knowledge_grants WHERE tenant_id=$1 AND membership_id=$2",
        [auth.tenantId, editor.id],
      );
      await blocker.query("COMMIT");
      committed = true;
    } finally {
      if (!committed) await blocker.query("ROLLBACK");
      blocker.release();
    }
    expect((await pending!).status).toBe(403);
    expect(
      (await repository.load()).documents.find((doc) => doc.id === "d1")!.name,
    ).toBe(original.name);
  }));

it("preserves one active administrator under concurrent account demotions", () =>
  fixture(async ({ app, admin, pool, schema }) => {
    const created = await request(app, admin, "/api/auth/members", "POST", {
      email: "second-admin@fixture.test",
      name: "Second administrator",
      password,
      role: "admin",
    });
    const second = (await created.json()).memberId;
    const responses = await Promise.all([
      request(app, admin, `/api/auth/members/${second}`, "PATCH", {
        revision: 1,
        role: "viewer",
        status: "active",
      }),
      request(app, admin, `/api/auth/members/${admin.id}`, "PATCH", {
        revision: 1,
        role: "viewer",
        status: "active",
      }),
    ]);
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(1);
    expect(
      responses.every((response) => [200, 401, 409].includes(response.status)),
    ).toBe(true);
    expect(
      (
        await pool.query(
          `SELECT count(*) AS n FROM ${schemaName(schema)}.memberships WHERE status='active' AND role_id='admin'`,
        )
      ).rows[0].n,
    ).toBe("1");
  }));
