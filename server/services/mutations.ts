import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { StateRepository } from "../repositories/state.js";
import type { Db } from "../types.js";
import { AppError } from "../http/errors.js";
import { appendRequestAudit } from "./audit.js";
export interface IdempotencyRecord {
  fingerprint: string;
  expiresAt: string;
  result: unknown;
}
/** Read-only preparation runs after replay lookup; mutation and replay result commit atomically. */
export async function mutateRequest<T>(
  c: Context,
  repository: StateRepository,
  change: (db: Db) => T,
  prepare?: () => Promise<void>,
): Promise<T> {
  const key = c.req.header("Idempotency-Key");
  if (key && !/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new AppError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "幂等键必须是 16–128 位字母、数字、短横线或下划线",
    );
  const body = c.get("validatedBody") ?? {};
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        c.req.method,
        c.req.path,
        body,
        c.req.header("If-Match") ?? null,
      ]),
    )
    .digest("hex");
  const scopeFor = (db: Db) =>
    `${db.settings.tenant}:${c.get("authenticatedSubject") ?? "unconfigured-auth"}:${key}`;
  const replay = (db: Db) => {
    if (!key) return undefined;
    const saved = db.idempotency?.[scopeFor(db)];
    if (!saved || Date.parse(saved.expiresAt) <= Date.now()) return undefined;
    if (saved.fingerprint !== fingerprint)
      throw new AppError(409, "IDEMPOTENCY_CONFLICT", "该幂等键已用于不同请求");
    return saved;
  };
  if (prepare) {
    const saved = key ? replay(await repository.load()) : undefined;
    if (saved) return structuredClone(saved.result) as T;
    await prepare();
  }
  const commit = (db: Db) => {
    const result = change(db);
    if (
      result !== null &&
      result !== false &&
      c.req.path !== "/api/retrieval/search"
    )
      appendRequestAudit(db, c, result);
    return result;
  };
  return repository.update((db) => {
    if (!key) return commit(db);
    const scope = scopeFor(db);
    const now = Date.now();
    const records = (db.idempotency ??= {});
    for (const [id, record] of Object.entries(records))
      if (Date.parse(record.expiresAt) <= now) delete records[id];
    const saved = replay(db);
    if (saved) {
      return structuredClone(saved.result) as T;
    }
    if (Object.keys(records).length >= 10_000)
      throw new AppError(
        429,
        "IDEMPOTENCY_CAPACITY",
        "当前幂等记录已满，请稍后重试",
      );
    const result = commit(db);
    if (result !== null && result !== false)
      records[scope] = {
        fingerprint,
        expiresAt: new Date(now + 24 * 3600_000).toISOString(),
        result: structuredClone(result ?? null),
      };
    return result;
  });
}
