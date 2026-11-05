import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Db } from "../types.js";

const DATA_DIR = process.env.DATA_DIR ?? "data";
const DB_FILE = `${DATA_DIR}/db.json`;

export class Store {
  private db: Db | null = null;

  constructor(private readonly seed: Db) {}

  async load(): Promise<Db> {
    if (this.db) return this.db;
    try {
      const raw = await readFile(DB_FILE, "utf8");
      const saved = JSON.parse(raw) as Partial<Db>;
      this.db = { ...structuredClone(this.seed), ...saved };
    } catch {
      this.db = structuredClone(this.seed);
      await this.flush();
    }
    return this.db;
  }

  async update<T>(mutate: (db: Db) => T): Promise<T> {
    const db = await this.load();
    const result = mutate(db);
    await this.flush();
    return result;
  }

  private async flush(): Promise<void> {
    if (!this.db) return;
    await mkdir(dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(this.db, null, 2), "utf8");
    await rename(tmp, DB_FILE);
  }
}
