// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
import { JobQueue, scheduleText } from "../../server/jobs/queue";
import { chunkText, runOne } from "../../server/jobs/worker";
import { taskDto } from "../../server/jobs/views";
async function fixture(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-p2-jobs-"));
  try {
    await run(join(dir, "db.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
it("recovers a persisted queued task after restart and prepares real text", () =>
  fixture(async (file) => {
    const seed = createSeedDb();
    const repository = new Store(seed, file);
    await repository.update((db) =>
      scheduleText(db, db.documents[0], "中文😀内容。".repeat(200)),
    );
    const restarted = new Store(seed, file);
    expect(await runOne(new JobQueue(restarted))).toBe(true);
    const db = await restarted.load();
    const task = db.tasks.at(-1)!;
    expect(task.job?.state).toBe("succeeded");
    expect(db.documents[0].chunks.length).toBeGreaterThan(1);
    expect(task.job?.events.map((event) => event.type)).toContain("checkpoint");
    expect(JSON.stringify(taskDto(task))).not.toContain("leaseToken");
    expect(JSON.stringify(taskDto(task))).not.toContain("inputText");
  }));
it("permits one claimant, reclaims an expired lease and rejects the stale worker", () =>
  fixture(async (file) => {
    const repository = new Store(createSeedDb(), file);
    await repository.update((db) =>
      scheduleText(db, db.documents[0], "待恢复的文本"),
    );
    const queue = new JobQueue(repository, 1000);
    const now = new Date();
    const claims = await Promise.all([queue.claim(now), queue.claim(now)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims.find(Boolean)!;
    expect(await queue.claim(new Date(now.getTime() + 500))).toBeNull();
    const recovered = await queue.claim(new Date(now.getTime() + 1001));
    expect(recovered?.job?.attempts).toBe(2);
    expect(
      await queue.complete(
        first.id,
        first.job!.leaseToken!,
        ["错误旧结果"],
        new Date(now.getTime() + 1002),
      ),
    ).toBe(false);
    expect(
      await queue.complete(
        recovered!.id,
        recovered!.job!.leaseToken!,
        ["恢复后的文本"],
        new Date(now.getTime() + 1002),
      ),
    ).toBe(true);
  }));
it("persists bounded retries and cancels results for changed versions", () =>
  fixture(async (file) => {
    const repository = new Store(createSeedDb(), file);
    await repository.update((db) => scheduleText(db, db.documents[0], "text"));
    const queue = new JobQueue(repository);
    const now = new Date();
    let task = await queue.claim(now);
    await queue.fail(
      task!.id,
      task!.job!.leaseToken!,
      "TEMPORARY_FAILURE",
      true,
      now,
    );
    expect((await repository.load()).tasks.at(-1)?.job?.state).toBe(
      "retry_wait",
    );
    expect(await queue.claim(new Date(now.getTime() + 1000))).toBeNull();
    task = await queue.claim(new Date(now.getTime() + 2001));
    expect(task?.job?.attempts).toBe(2);
    await repository.update((db) =>
      db.documents[0].versions.unshift({
        version: "v4.0",
        date: "today",
        note: "new",
        chunks: ["new"],
      }),
    );
    await queue.complete(
      task!.id,
      task!.job!.leaseToken!,
      ["stale"],
      new Date(now.getTime() + 2002),
    );
    expect((await repository.load()).tasks.at(-1)?.job?.state).toBe(
      "cancelled",
    );
  }));
it("chunks Unicode characters using the configured size and overlap", () => {
  const input = "😀".repeat(150);
  const chunks = chunkText(input, 64, 8);
  expect(chunks).toHaveLength(3);
  expect(Array.from(chunks[0])).toHaveLength(64);
  expect(chunks.join("")).not.toContain("\uFFFD");
  expect(() => chunkText(input, 64, 64)).toThrow("INVALID_CHUNK_CONFIG");
});
it("does not commit cancelled work even with the old lease token", () =>
  fixture(async (file) => {
    const repository = new Store(createSeedDb(), file);
    await repository.update((db) =>
      scheduleText(db, db.documents[0], "可取消文本"),
    );
    const queue = new JobQueue(repository);
    const claimed = await queue.claim();
    const { cancelTask } = await import("../../server/jobs/queue");
    await repository.update((db) =>
      cancelTask(
        db,
        db.tasks.find((task) => task.id === claimed!.id)!,
      ),
    );
    expect(
      await queue.complete(claimed!.id, claimed!.job!.leaseToken!, [
        "不应保存",
      ]),
    ).toBe(false);
    expect((await repository.load()).tasks.at(-1)?.job?.state).toBe(
      "cancelled",
    );
  }));
