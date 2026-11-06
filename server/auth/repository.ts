import type { Pool } from "pg";
import { transaction } from "../db/session.js";
import { readSqlState, writeSqlState } from "../repositories/postgres.js";
import type { StateRepository } from "../repositories/state.js";
import type { Db } from "../types.js";
import { normalizeState } from "../db/state-mapping.js";
import { AppError } from "../http/errors.js";
import { advanceRevision } from "../services/consistency.js";
import { AuthService, type Principal } from "./service.js";
import {
  authorize,
  mergeVisible,
  safeResult,
  visibleState,
  type Operation,
} from "./policy.js";

export class AuthorizedRepository implements StateRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auth: AuthService,
    private readonly token: string,
    private readonly operation: Operation,
    private readonly onPrincipal: (p: Principal) => void,
  ) {}
  async load() {
    return transaction(this.pool, this.auth.schema, false, async (client) => {
      const p = await this.auth.principal(client, this.token);
      this.onPrincipal(p);
      const full = await readSqlState(client, p.tenantId);
      authorize(p, full, this.operation);
      return visibleState(p, full, this.operation);
    });
  }
  async update<T>(change: (db: Db) => T): Promise<T> {
    return transaction(this.pool, this.auth.schema, true, async (client) => {
      await client.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        this.auth.tenantId,
      ]);
      const p = await this.auth.principal(client, this.token);
      this.onPrincipal(p);
      const full = await readSqlState(client, p.tenantId);
      authorize(p, full, this.operation);
      const before = visibleState(p, full, this.operation);
      const next = structuredClone(before);
      const result = change(next);
      for (const audit of next.auditLogs)
        if (!full.auditLogs.some((item) => item.id === audit.id))
          audit.authorization = "enforced";
      if (result && typeof result === "object" && "then" in result)
        throw new Error("ASYNC_MUTATION_NOT_SUPPORTED");
      for (const conversation of next.conversations) {
        const original = full.conversations.find(
          (item) => item.id === conversation.id,
        );
        if (!original) conversation.ownerMembershipId = p.memberId;
        for (const message of conversation.messages)
          if (
            message.role === "assistant" &&
            !original?.messages.some((item) => item.id === message.id)
          )
            message.evidenceDocumentIds = [
              ...new Set(
                (message.retrieval?.hits ?? []).flatMap((hit) => {
                  const doc = next.documents.find((doc) =>
                    hit.id.startsWith(`${doc.id}:`),
                  );
                  return doc ? [doc.id] : [];
                }),
              ),
            ];
      }
      const combined = mergeVisible(full, before, next) as Db;
      for (const base of full.bases)
        if (
          !combined.bases.some((item) => item.id === base.id) &&
          full.documents.some((doc) => doc.baseId === base.id)
        )
          throw new AppError(
            409,
            "RESOURCE_NOT_EMPTY",
            "知识库仍有关联文档，请先处理这些文档",
          );
      const merged = normalizeState(combined, p.tenantId);
      for (const base of merged.bases)
        if (
          full.bases.find((item) => item.id === base.id)?.name !== base.name
        ) {
          for (const doc of merged.documents)
            if (doc.baseId === base.id && doc.category !== base.name) {
              doc.category = base.name;
              advanceRevision(doc);
            }
        }
      // Create grants atomically; workspace management alone never grants content-read.
      for (const base of merged.bases)
        if (!full.bases.some((item) => item.id === base.id)) {
          const permissions = p.capabilities.filter((permission) =>
            ["read", "write", "publish", "manage"].includes(permission),
          );
          await client.query(
            "INSERT INTO knowledge_grants(tenant_id,base_id,membership_id,permissions) VALUES($1,$2,$3,$4)",
            [p.tenantId, base.id, p.memberId, permissions],
          );
          p.grants[base.id] = permissions;
        }
      for (const base of full.bases)
        if (!merged.bases.some((item) => item.id === base.id)) {
          if (full.documents.some((doc) => doc.baseId === base.id))
            throw new AppError(
              409,
              "RESOURCE_NOT_EMPTY",
              "知识库仍有关联文档，请先处理这些文档",
            );
          await client.query(
            "DELETE FROM knowledge_grants WHERE tenant_id=$1 AND base_id=$2",
            [p.tenantId, base.id],
          );
        }
      await writeSqlState(client, p.tenantId, merged, full);
      return safeResult(result, p, merged) as T;
    });
  }
}
