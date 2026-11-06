// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../../server/app";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
async function fixture(
  run: (app: ReturnType<typeof createApp>) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-p2-api-"));
  try {
    await run(createApp(new Store(createSeedDb(), join(dir, "db.json"))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
it("rejects malformed JSON, arrays, unknown fields and out-of-range retrieval options", () =>
  fixture(async (app) => {
    for (const body of ["{", "[]", '{"name":"x","admin":true}']) {
      const response = await app.request("/api/knowledge/bases", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      });
      expect(response.status).toBe(400);
      expect((await response.json()).requestId).toBeTruthy();
    }
    const response = await app.request(
      "/api/retrieval/search",
      json("POST", { query: "x", topK: -1 }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("VALIDATION_ERROR");
  }));
it("atomically renames a knowledge base and preserves document relationships", () =>
  fixture(async (app) => {
    const response = await app.request(
      "/api/knowledge/bases/b1",
      json("PUT", { name: "企业制度新版", revision: 1 }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).base.revision).toBe(2);
    const documents = (
      await (await app.request("/api/knowledge/documents")).json()
    ).documents;
    expect(
      documents
        .filter((doc: { baseId: string }) => doc.baseId === "b1")
        .every((doc: { category: string }) => doc.category === "企业制度新版"),
    ).toBe(true);
    expect(
      (await app.request("/api/knowledge/bases/b1", { method: "DELETE" }))
        .status,
    ).toBe(409);
  }));
it("rejects stale edits and preserves major version numbers", () =>
  fixture(async (app) => {
    const responses = await Promise.all([
      app.request(
        "/api/knowledge/documents/d1/chunks/0",
        json("PUT", { content: "第一个新分块", revision: 1 }),
      ),
      app.request(
        "/api/knowledge/documents/d1/chunks/0",
        json("PUT", { content: "冲突分块", revision: 1 }),
      ),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const doc = (
      await (await app.request("/api/knowledge/documents/d1")).json()
    ).document;
    expect(doc.versions[0].version).toBe("v3.1");
    expect(doc.revision).toBe(2);
    expect(doc.versions[1].chunks[0]).toBe(
      createSeedDb().documents[0].chunks[0],
    );
  }));
it("does not publish unfinished or empty documents", () =>
  fixture(async (app) => {
    const imported = await app.request(
      "/api/knowledge/documents/import",
      json("POST", {
        mode: "web",
        name: "pending.pdf",
        source: "https://example.com/pending.pdf",
        category: "企业制度",
      }),
    );
    expect(imported.status).toBe(201);
    const id = (await imported.json()).document.id;
    const published = await app.request(
      `/api/knowledge/documents/${id}/publish`,
      json("POST", { revision: 1 }),
    );
    expect(published.status).toBe(409);
    expect((await published.json()).code).toBe("DOCUMENT_NOT_READY");
  }));
it("links audit records to the actual answer and counts current questions", () =>
  fixture(async (app) => {
    const response = await app.request(
      "/api/conversations/annual-leave/messages",
      json("POST", { content: "报销" }),
    );
    const answer = (await response.json()).answerMessage;
    const logs = (await (await app.request("/api/audit")).json()).logs;
    const log = logs.find(
      (item: { messageId: string }) => item.messageId === answer.id,
    );
    expect(log).toBeTruthy();
    const detail = (await (await app.request(`/api/audit/${log.id}`)).json())
      .evidence;
    expect(detail.chain[1].detail).toContain(answer.id);
    const overview = (await (await app.request("/api/overview")).json()).stats;
    expect(overview.queriesToday).toBeGreaterThanOrEqual(1);
  }));
it("does not reflect an arbitrary Origin in CORS response headers", () =>
  fixture(async (app) => {
    const response = await app.request("/api/health", {
      headers: { origin: "https://untrusted.example" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const allowed = await app.request("/api/health", {
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173",
    );
  }));
it("replays an identical persisted creation and rejects key reuse with another input", () =>
  fixture(async (app) => {
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "regression-idem-0001",
    };
    const request = {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "幂等知识库" }),
    };
    const responses = await Promise.all([
      app.request("/api/knowledge/bases", request),
      app.request("/api/knowledge/bases", request),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(bodies[0].base.id).toBe(bodies[1].base.id);
    const conflict = await app.request("/api/knowledge/bases", {
      ...request,
      body: JSON.stringify({ name: "不同输入" }),
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe("IDEMPOTENCY_CONFLICT");
    const bases = (await (await app.request("/api/knowledge/bases")).json())
      .bases;
    expect(
      bases.filter((base: { name: string }) => base.name === "幂等知识库"),
    ).toHaveLength(1);
  }));
it("cannot silently change a tenant or remove the last administrator", () =>
  fixture(async (app) => {
    const settings = await app.request(
      "/api/settings",
      json("PUT", { tenant: "other-tenant", revision: 1 }),
    );
    expect(settings.status).toBe(403);
    const demote = await app.request(
      "/api/permissions/members/m1",
      json("PUT", { role: "普通成员", revision: 1 }),
    );
    expect(demote.status).toBe(409);
    expect((await demote.json()).code).toBe("LAST_ADMIN");
    const duplicate = await app.request(
      "/api/permissions/members",
      json("POST", { name: "重复用户", email: "ZHANGSAN@COMPANY.COM" }),
    );
    expect(duplicate.status).toBe(409);
  }));
it("replays a committed mutation after repository restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-p2-replay-"));
  try {
    const file = join(dir, "db.json");
    const options = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "restart-replay-key-001",
      },
      body: JSON.stringify({ name: "重启后幂等" }),
    };
    const first = (
      await (
        await createApp(new Store(createSeedDb(), file)).request(
          "/api/knowledge/bases",
          options,
        )
      ).json()
    ).base;
    const restarted = createApp(new Store(createSeedDb(), file));
    const second = (
      await (await restarted.request("/api/knowledge/bases", options)).json()
    ).base;
    expect(second.id).toBe(first.id);
    expect(
      (
        await (await restarted.request("/api/knowledge/bases")).json()
      ).bases.filter((base: { name: string }) => base.name === "重启后幂等"),
    ).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
