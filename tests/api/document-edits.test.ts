// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../../server/app";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
import { JobQueue } from "../../server/jobs/queue";
import { runOne, chunkText } from "../../server/jobs/worker";

async function fixture(
  run: (context: {
    repository: Store;
    app: ReturnType<typeof createApp>;
    file: string;
  }) => Promise<void>,
) {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-edits-"));
  const file = join(directory, "db.json");
  const seed = createSeedDb();
  seed.documents[0].chunks = ["  original one\n", "overlap + original two"];
  seed.documents[0].versions[0].chunks = [...seed.documents[0].chunks];
  const repository = new Store(seed, file);
  try {
    await run({ repository, app: createApp(repository), file });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function request(chunks: string[], revision = 1, key?: string) {
  return {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify({ chunks, revision }),
  };
}
const endpoint = "/api/knowledge/documents/d1/chunks";

it("commits a complete edit as one version/job and preserves exact chunks after restart", () =>
  fixture(async ({ app, repository, file }) => {
    const before = structuredClone((await repository.load()).documents[0]);
    const chunks = ["  edited first\n", "overlap + edited second\n"];
    const options = request(chunks, 1, "atomic-chunks-edit-key");
    const result = await app.request(endpoint, options);
    expect(result.status).toBe(200);
    const saved = (await result.json()).document;
    expect(saved.chunks).toEqual(chunks);
    expect(saved.versions).toHaveLength(before.versions.length + 1);
    expect(saved.versions[1].chunks).toEqual(before.chunks);
    expect(
      (await repository.load()).tasks.filter(
        (task) => task.job?.kind === "validate_chunks",
      ),
    ).toHaveLength(1);
    const restarted = new Store(createSeedDb(), file);
    await runOne(new JobQueue(restarted));
    const after = (await restarted.load()).documents[0];
    expect(after.task).toBe("done");
    expect(after.chunks).toEqual(chunks);
    expect(after.versions[0].chunks).toEqual(chunks);
    expect(
      (await (await createApp(restarted).request(endpoint, options)).json())
        .document.id,
    ).toBe(saved.id);
    expect((await restarted.load()).documents[0].versions).toHaveLength(
      saved.versions.length,
    );
  }));

it("rejects invalid or conflicting batches without saving a partial edit", () =>
  fixture(async ({ app, repository }) => {
    const before = structuredClone(await repository.load());
    for (const options of [
      request(["valid first", ""]),
      request(["different count"]),
      request(["first", "second"], 999),
    ]) {
      expect([400, 409]).toContain(
        (await app.request(endpoint, options)).status,
      );
      expect((await repository.load()).documents).toEqual(before.documents);
      expect((await repository.load()).tasks).toEqual(before.tasks);
    }
    const responses = await Promise.all([
      app.request(endpoint, request(["winner one", "winner two"])),
      app.request(endpoint, request(["other one", "other two"])),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect((await repository.load()).documents[0].versions).toHaveLength(
      before.documents[0].versions.length + 1,
    );
  }));

it("keeps unchanged saves inert and retains the legacy single-chunk route", () =>
  fixture(async ({ app, repository }) => {
    const before = structuredClone(await repository.load());
    expect(
      (await app.request(endpoint, request(before.documents[0].chunks))).status,
    ).toBe(200);
    expect((await repository.load()).documents).toEqual(before.documents);
    expect((await repository.load()).tasks).toEqual(before.tasks);
    const edited = await app.request(`${endpoint}/0`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "  preserve indentation\n",
        revision: 1,
      }),
    });
    expect(edited.status).toBe(200);
    await runOne(new JobQueue(repository));
    expect((await repository.load()).documents[0].chunks).toEqual([
      "  preserve indentation\n",
      before.documents[0].chunks[1],
    ]);
  }));

it("rejects excessive chunk expansion and persists the failure without replacing document content", () =>
  fixture(async ({ app, repository }) => {
    expect(() => chunkText("a".repeat(100_000), 64, 63)).toThrow(
      "CHUNK_EXPANSION_LIMIT",
    );
    await repository.update((db) => {
      db.settings.chunkSize = "64";
      db.settings.overlap = "63";
    });
    const result = await app.request("/api/knowledge/documents/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "text",
        name: "bounded.md",
        text: "a".repeat(100_000),
        category: "企业制度",
      }),
    });
    expect(result.status).toBe(201);
    const doc = (await result.json()).document;
    await runOne(new JobQueue(repository));
    const saved = (await repository.load()).documents.find(
      (item) => item.id === doc.id,
    )!;
    expect(saved.chunks).toEqual([]);
    expect(saved.task).toBe("error");
    expect((await repository.load()).tasks.at(-1)?.error).toBe(
      "CHUNK_EXPANSION_LIMIT",
    );
  }));
