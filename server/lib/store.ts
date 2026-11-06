import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { StateRepository } from "../repositories/state.js";
import type { Db } from "../types.js";
import { fileArtifact } from "../../shared/contracts.js";

export class Store implements StateRepository {
  private db: Db | null = null;
  private loading: Promise<Db> | null = null;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private readonly seed: Db,
    private readonly file = `${process.env.DATA_DIR ?? "data"}/db.json`,
  ) {}

  async load(): Promise<Db> {
    if (this.db) return this.db;
    if (!this.loading)
      this.loading = this.read().catch((error) => {
        this.loading = null;
        throw error;
      });
    return this.loading;
  }
  private async read(): Promise<Db> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const initial = structuredClone(this.seed);
      await this.flush(initial);
      this.db = initial;
      return initial;
    }
    // Corruption is an error, never a reason to replace a user's database with seed data.
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved))
      throw new Error("数据文件格式无效，已停止写入，请检查备份");
    // Seed belongs only to a new database. Filling holes in an existing file can
    // silently resurrect demo records and persist them during an unrelated write.
    const persisted = saved as Db;
    for (const key of [
      "conversations",
      "bases",
      "documents",
      "tasks",
      "members",
      "auditLogs",
      "evaluations",
    ] as const) {
      if (!Array.isArray(persisted[key]))
        throw new Error(`数据文件字段 ${key} 无效，已停止写入`);
    }
    if (
      !persisted.settings ||
      !persisted.rules ||
      typeof persisted.settings !== "object" ||
      typeof persisted.rules !== "object" ||
      Array.isArray(persisted.settings) ||
      Array.isArray(persisted.rules)
    )
      throw new Error("数据文件配置无效，已停止写入");
    if (
      persisted.files !== undefined &&
      (!persisted.files ||
        typeof persisted.files !== "object" ||
        Array.isArray(persisted.files) ||
        Object.entries(persisted.files).some(
          ([id, artifact]) =>
            !fileArtifact.safeParse(artifact).success || artifact.id !== id,
        ))
    )
      throw new Error("原文件元数据无效，已停止写入，请检查备份");
    this.db = persisted;
    return persisted;
  }
  async update<T>(mutate: (db: Db) => T): Promise<T> {
    const task = this.writes.then(async () => {
      const next = structuredClone(await this.load());
      const result = mutate(next);
      await this.flush(next);
      this.db = next;
      return result;
    });
    this.writes = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
  private async flush(db: Db): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(db, null, 2), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await rename(tmp, this.file);
    } finally {
      await rm(tmp, { force: true });
    }
  }
}
