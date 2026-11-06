// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
import { JobQueue } from "../../server/jobs/queue";
import { runOne } from "../../server/jobs/worker";

async function fixture(
  run: (context: {
    app: ReturnType<typeof createApp>;
    repository: Store;
    file: string;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-audit-"));
  const file = join(directory, "db.json");
  const repository = new Store(createSeedDb(), file);
  try {
    await run({ app: createApp(repository), repository, file });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const json = (body: unknown, key?: string, method = "POST") => ({
  method,
  headers: {
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {}),
  },
  body: JSON.stringify(body),
});

it("rejects unimplemented baseIds rather than ignoring a requested knowledge scope", () =>
  fixture(async ({ app, repository }) => {
    const before = structuredClone(await repository.load());
    const beforeCount = (await (await app.request("/api/overview")).json())
      .stats.queriesToday;
    for (const baseIds of [[], ["b1"]]) {
      for (const [path, input] of [
        ["/api/retrieval/search", { query: "年假", baseIds }],
        [
          "/api/conversations/annual-leave/messages",
          { content: "年假", baseIds },
        ],
      ] as const) {
        const response = await app.request(path, json(input));
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBe("BASE_ROUTING_UNAVAILABLE");
        expect(body.requestId).toBeTruthy();
      }
    }
    expect((await repository.load()).conversations).toEqual(
      before.conversations,
    );
    expect(
      (await (await app.request("/api/overview")).json()).stats.queriesToday,
    ).toBe(beforeCount);
    expect(
      (await repository.load()).auditLogs.filter(
        (log) => log.errorCode === "BASE_ROUTING_UNAVAILABLE",
      ),
    ).toHaveLength(4);
  }));

it("normalizes legacy and new permission/source claims without rewriting saved history", () =>
  fixture(async ({ app, repository }) => {
    await repository.update((db) => {
      const message = db.conversations
        .find((conversation) => conversation.id === "annual-leave")!
        .messages.find((message) => message.role === "assistant")!;
      message.permission = { checked: ["租户隔离"], result: "通过" };
    });
    const raw = structuredClone(
      (await repository.load()).conversations.find(
        (conversation) => conversation.id === "annual-leave",
      )!,
    );
    const old = (
      await (await app.request("/api/conversations/annual-leave")).json()
    ).conversation.messages.find(
      (message: { role: string }) => message.role === "assistant",
    );
    expect(old.permission).toEqual({
      status: "not_configured",
      checked: [],
      result: expect.stringContaining("未执行"),
    });
    expect(old.answerMode).toBe("legacy_unverified");
    expect(
      (await repository.load()).conversations.find(
        (conversation) => conversation.id === raw.id,
      ),
    ).toEqual(raw);
    const response = await app.request(
      "/api/conversations/annual-leave/messages",
      json({ content: "公司的年假制度是什么" }),
    );
    const answer = (await response.json()).answerMessage;
    expect(answer.answerMode).toBe("rule_demo");
    expect(answer.sources).toHaveLength(2);
    expect(answer.permission.checked).toEqual([]);
    expect(
      answer.sources.every(
        (source: { provenance: string; verified: boolean }) =>
          source.provenance === "demo" && source.verified === false,
      ),
    ).toBe(true);
    expect(answer.retrieval.permissionFiltering).toBe("not_configured");
    expect(answer.retrieval.timing).toBe("simulated");
    expect(answer.retrieval.stages[0].detail).toContain("未执行");
    const stored = (await repository.load()).conversations
      .find((conversation) => conversation.id === "annual-leave")!
      .messages.at(-1)!;
    expect(stored.retrieval?.stages[0].detail).toContain("未执行");
  }));

it("atomically records a mutation once across retries/restart and never trusts identity headers or copies input values", () =>
  fixture(async ({ app, repository, file }) => {
    const secret = "sk-audit-private-value";
    const options = json(
      { name: secret, owner: "冒充管理员" },
      "audit-idempotency-key-001",
    );
    const response = await app.request("/api/knowledge/bases", {
      ...options,
      headers: {
        ...options.headers,
        Authorization: "Bearer never-record-this",
        "X-User-ID": "claimed-admin",
      },
    });
    expect(response.status).toBe(201);
    const base = (await response.json()).base;
    const requestId = response.headers.get("X-Request-ID");
    const first = (await repository.load()).auditLogs.filter(
      (log) => log.targetId === base.id,
    );
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      actorKind: "anonymous",
      authorization: "not_configured",
      action: "知识库创建",
      outcome: "committed",
      requestId,
      route: "/api/knowledge/bases",
    });
    expect(JSON.stringify(first)).not.toMatch(
      /sk-audit-private-value|冒充管理员|never-record-this|claimed-admin/,
    );
    const restarted = new Store(createSeedDb(), file);
    const replay = await createApp(restarted).request(
      "/api/knowledge/bases",
      options,
    );
    expect((await replay.json()).base.id).toBe(base.id);
    expect(
      (await restarted.load()).auditLogs.filter(
        (log) => log.targetId === base.id,
      ),
    ).toHaveLength(1);
    const byRequest = (
      await (
        await createApp(restarted).request(`/api/audit?query=${requestId}`)
      ).json()
    ).logs;
    expect(byRequest).toHaveLength(1);
  }));

it("records metadata-only failures and system task completion even when optional retrieval logging is disabled", () =>
  fixture(async ({ app, repository }) => {
    await app.request(
      "/api/settings",
      json({ revision: 1, audit: false }, undefined, "PUT"),
    );
    const secret = "sk-sensitive-question-marker";
    const answer = await app.request(
      "/api/conversations/annual-leave/messages",
      json({ content: `年假 ${secret}` }),
    );
    expect(answer.status).toBe(200);
    const logsBeforeSearch = (await repository.load()).auditLogs.length;
    await app.request("/api/retrieval/search", json({ query: secret }));
    expect((await repository.load()).auditLogs).toHaveLength(logsBeforeSearch);
    const failed = await app.request(
      "/api/knowledge/bases",
      json({ name: secret, unknown: secret }),
    );
    expect(failed.status).toBe(400);
    const failure = (await repository.load()).auditLogs.at(-1)!;
    expect(failure).toMatchObject({
      outcome: "failed",
      httpStatus: 400,
      errorCode: "VALIDATION_ERROR",
      route: "/api/knowledge/bases",
    });
    const missing = await app.request(
      "/api/knowledge/documents/not-present/rollback",
      json({ version: "v1.0", revision: 1 }),
    );
    expect(missing.status).toBe(404);
    const missingCode = (await missing.json()).code;
    expect((await repository.load()).auditLogs.at(-1)?.errorCode).toBe(
      missingCode,
    );
    const imported = await app.request(
      "/api/knowledge/documents/import",
      json({
        mode: "text",
        name: "audit-input.md",
        text: secret,
        category: "企业制度",
      }),
    );
    expect(imported.status).toBe(201);
    await runOne(new JobQueue(repository));
    const fresh = (await repository.load()).auditLogs.filter(
      (log) => log.schemaVersion === 1,
    );
    expect(
      fresh.some(
        (log) =>
          log.actorKind === "system" &&
          log.action === "后台文本处理" &&
          log.outcome === "committed",
      ),
    ).toBe(true);
    expect(
      fresh.some((log) => log.action === "智能问答" && log.messageId),
    ).toBe(true);
    expect(JSON.stringify(fresh)).not.toContain(secret);
  }));

it("preserves the original failure and emits a structured warning if the audit store is unavailable", () =>
  fixture(async ({ repository }) => {
    const before = structuredClone(await repository.load());
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const failing = createApp({
      load: () => repository.load(),
      update: async () => {
        throw new Error("storage unavailable with private details");
      },
    });
    const response = await failing.request(
      "/api/knowledge/bases",
      json({ name: "failed creation" }),
    );
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("INTERNAL_ERROR");
    expect(await repository.load()).toEqual(before);
    const output = JSON.stringify(stderr.mock.calls);
    expect(output).toContain("AUDIT_WRITE_FAILED");
    expect(output).not.toContain("private details");
  }));
