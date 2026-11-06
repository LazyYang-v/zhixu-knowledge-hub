// @vitest-environment node
import { expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
it("serializes first load and concurrent mutations without losing records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-store-"));
  try {
    const file = join(dir, "db.json"),
      store = new Store(createSeedDb(), file);
    const loaded = await Promise.all(
      Array.from({ length: 12 }, () => store.load()),
    );
    expect(loaded.every((db) => db === loaded[0])).toBe(true);
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        store.update((db) =>
          db.bases.push({
            id: `test-${index}`,
            name: `测试-${index}`,
            description: "",
            color: "purple",
            owner: "test",
            access: "test",
          }),
        ),
      ),
    );
    expect(JSON.parse(await readFile(file, "utf8")).bases).toHaveLength(16);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("preserves corrupt data and leaves memory unchanged on failed mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-store-"));
  try {
    const file = join(dir, "db.json");
    await writeFile(file, "broken database");
    const store = new Store(createSeedDb(), file);
    await expect(store.load()).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("broken database");
    await rm(file);
    const good = new Store(createSeedDb(), file);
    await good.load();
    await expect(
      good.update((db) => {
        db.bases = [];
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect((await good.load()).bases).toHaveLength(4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("refuses existing JSON missing a required root field instead of restoring demo seed and writing it back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-store-"));
  try {
    const file = join(dir, "db.json");
    for (const key of [
      "conversations",
      "bases",
      "documents",
      "tasks",
      "members",
      "auditLogs",
      "evaluations",
      "settings",
      "rules",
    ]) {
      const saved: Record<string, unknown> = { ...createSeedDb() };
      delete saved[key];
      const original = JSON.stringify(saved);
      await writeFile(file, original);
      const store = new Store(createSeedDb(), file);
      await expect(store.load()).rejects.toThrow("已停止写入");
      const mutate = vi.fn();
      await expect(store.update(mutate)).rejects.toThrow("已停止写入");
      expect(mutate).not.toHaveBeenCalled();
      expect(await readFile(file, "utf8")).toBe(original);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("refuses array-valued settings or rules before any mutation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-store-"));
  try {
    const file = join(dir, "db.json");
    for (const key of ["settings", "rules"]) {
      const original = JSON.stringify({ ...createSeedDb(), [key]: [] });
      await writeFile(file, original);
      const store = new Store(createSeedDb(), file);
      await expect(store.load()).rejects.toThrow("已停止写入");
      expect(await readFile(file, "utf8")).toBe(original);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("preserves valid empty collections, unknown fields, and absent optional fields without seed merging", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhixu-store-"));
  try {
    const file = join(dir, "db.json");
    const saved = {
      ...createSeedDb(),
      conversations: [],
      bases: [],
      documents: [],
      tasks: [],
      members: [],
      auditLogs: [],
      evaluations: [],
      futureExtension: { retained: true },
    };
    await writeFile(file, JSON.stringify(saved));
    const store = new Store(createSeedDb(), file);
    expect(await store.load()).toEqual(saved);
    await store.update((db) => {
      db.settings.workspace = "updated workspace";
    });
    const reloaded = new Store(createSeedDb(), file);
    expect(await reloaded.load()).toEqual({
      ...saved,
      settings: { ...saved.settings, workspace: "updated workspace" },
    });
    expect((await reloaded.load()).files).toBeUndefined();
    expect((await reloaded.load()).idempotency).toBeUndefined();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
