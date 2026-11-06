import type { Db } from "../types.js";
/** All business changes commit atomically through update; readers never write the returned snapshot. */
export interface StateRepository {
  load(): Promise<Db>;
  update<T>(change: (db: Db) => T): Promise<T>;
}
