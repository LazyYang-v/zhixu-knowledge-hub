import { inspectData } from "../services/data-check.js";
import {
  baseForDocument,
  versionDto,
  publicationMetadata,
} from "../services/consistency.js";
import type { Db, ProcessingTask } from "../types.js";

export type SqlRow = Record<string, unknown>;
export const tableKeys: Record<string, string[]> = {
  workspace_settings: ["tenant_id"],
  knowledge_bases: ["tenant_id", "id"],
  legacy_members: ["tenant_id", "id"],
  file_artifacts: ["tenant_id", "id"],
  documents: ["tenant_id", "id"],
  document_versions: ["tenant_id", "id"],
  chunks: ["tenant_id", "id"],
  document_working_chunks: ["tenant_id", "document_id", "ordinal"],
  processing_tasks: ["tenant_id", "id"],
  task_events: ["tenant_id", "task_id", "sequence"],
  conversations: ["tenant_id", "id"],
  messages: ["tenant_id", "id"],
  audit_events: ["tenant_id", "id"],
  evaluation_runs: ["tenant_id", "id"],
  permission_rules: ["tenant_id", "key"],
  idempotency_records: ["tenant_id", "key"],
};
export const jsonColumns = new Set([
  "values",
  "legacy_root",
  "metadata",
  "job_snapshot",
  "result",
]);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function without(value: object, keys: string[]) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}
export function normalizeState(input: Db, tenant: string): Db {
  if (!tenant || input.settings?.tenant !== tenant)
    throw new Error("TENANT_MAPPING_REQUIRED");
  if (inspectData(input).totals.error)
    throw new Error("DATA_INTEGRITY_CHECK_FAILED");
  const db = structuredClone(input);
  for (const item of [...db.bases, ...db.documents, ...db.members]) {
    if (item.tenantId !== undefined && item.tenantId !== tenant)
      throw new Error("TENANT_MAPPING_CONFLICT");
    item.tenantId = tenant;
    item.revision ??= 1;
  }
  for (const doc of db.documents) {
    const base = baseForDocument(doc, db.bases);
    if (!base) throw new Error("BASE_MAPPING_REQUIRED");
    doc.baseId = base.id;
    doc.versions = doc.versions.map((version) => versionDto(doc.id, version));
    if (doc.publishedVersionId === undefined)
      doc.publishedVersionId =
        doc.status === "已发布" && doc.task === "done"
          ? (doc.versions[0]?.id ?? null)
          : null;
    if (doc.publishedVersionId && !doc.publishedMetadata)
      doc.publishedMetadata = publicationMetadata(doc);
  }
  for (const audit of db.auditLogs) audit.actorKind ??= "legacy_unverified";
  db.files ??= {};
  db.idempotency ??= {};
  db.rulesRevision ??= 1;
  return db;
}
export function projectState(
  input: Db,
  tenant: string,
): Record<string, SqlRow[]> {
  const db = normalizeState(input, tenant);
  const tables = Object.fromEntries(
    Object.keys(tableKeys).map((table) => [table, []]),
  ) as Record<string, SqlRow[]>;
  const add = (table: string, row: SqlRow) =>
    tables[table].push({ tenant_id: tenant, ...row });
  add("workspace_settings", {
    values: db.settings,
    legacy_root: without(db, [
      "settings",
      "bases",
      "documents",
      "members",
      "files",
      "tasks",
      "conversations",
      "auditLogs",
      "evaluations",
      "rules",
      "idempotency",
    ]),
  });
  db.bases.forEach((base, position) =>
    add("knowledge_bases", {
      id: base.id,
      name: base.name,
      normalized_name: base.name.normalize("NFKC").trim().toLowerCase(),
      revision: base.revision,
      position,
      metadata: without(base, ["id", "tenantId", "name", "revision"]),
    }),
  );
  db.members.forEach((member, position) =>
    add("legacy_members", {
      id: member.id,
      email_normalized: member.email.trim().toLowerCase(),
      role: member.role,
      revision: member.revision,
      position,
      metadata: without(member, ["id", "tenantId", "role", "revision"]),
    }),
  );
  for (const artifact of Object.values(db.files!))
    add("file_artifacts", {
      id: artifact.id,
      name: artifact.name,
      size_bytes: artifact.size,
      sha256: artifact.sha256,
      media_type: artifact.mediaType,
      created_at: artifact.createdAt,
      uploader_membership_id: artifact.uploaderMembershipId ?? null,
      metadata: without(artifact, [
        "id",
        "name",
        "size",
        "sha256",
        "mediaType",
        "createdAt",
        "uploaderMembershipId",
      ]),
    });
  db.documents.forEach((doc, position) => {
    add("documents", {
      id: doc.id,
      base_id: doc.baseId,
      name: doc.name,
      status: doc.status,
      revision: doc.revision,
      source_artifact_id: doc.sourceArtifactId ?? null,
      published_version_id: doc.publishedVersionId ?? null,
      position,
      metadata: without(doc, [
        "id",
        "tenantId",
        "baseId",
        "name",
        "status",
        "revision",
        "sourceArtifactId",
        "publishedVersionId",
        "chunks",
        "versions",
      ]),
    });
    doc.chunks.forEach((content, ordinal) =>
      add("document_working_chunks", { document_id: doc.id, ordinal, content }),
    );
    doc.versions.forEach((version, index) => {
      add("document_versions", {
        id: version.id,
        document_id: doc.id,
        version_label: version.version,
        position: index,
        source_artifact_id: version.sourceArtifactId ?? null,
        metadata: without(version, [
          "id",
          "version",
          "sourceArtifactId",
          "chunks",
          "chunkIds",
        ]),
      });
      version.chunks.forEach((content, ordinal) =>
        add("chunks", {
          id: version.chunkIds![ordinal],
          version_id: version.id,
          ordinal,
          content,
        }),
      );
    });
  });
  db.tasks.forEach((task, position) => {
    const version = db.documents
      .find((doc) => doc.id === task.docId)
      ?.versions.find((version) => version.version === task.job?.version);
    if (task.job && !version) throw new Error("JOB_VERSION_MAPPING_REQUIRED");
    add("processing_tasks", {
      id: task.id,
      document_id: task.docId,
      version_id: version?.id ?? null,
      kind: task.job?.kind ?? null,
      state: task.job?.state ?? null,
      job_snapshot: task.job
        ? without(task.job, ["kind", "state", "version", "events"])
        : null,
      superseded_by: task.supersededBy ?? null,
      position,
      metadata: without(task, ["id", "docId", "job", "supersededBy"]),
    });
    for (const event of task.job?.events ?? [])
      add("task_events", { task_id: task.id, ...event });
  });
  db.conversations.forEach((conversation, position) => {
    add("conversations", {
      id: conversation.id,
      title: conversation.title,
      owner_membership_id: conversation.ownerMembershipId ?? null,
      position,
      metadata: without(conversation, [
        "id",
        "title",
        "messages",
        "ownerMembershipId",
      ]),
    });
    conversation.messages.forEach((message, ordinal) =>
      add("messages", {
        id: message.id,
        conversation_id: conversation.id,
        ordinal,
        role: message.role,
        content: message.content,
        metadata: without(message, ["id", "role", "content"]),
      }),
    );
  });
  db.auditLogs.forEach((audit, position) =>
    add("audit_events", {
      id: audit.id,
      action: audit.action,
      actor_kind: audit.actorKind,
      request_id: audit.requestId ?? null,
      position,
      metadata: without(audit, ["id", "action", "actorKind", "requestId"]),
    }),
  );
  db.evaluations.forEach((evaluation, position) =>
    add("evaluation_runs", {
      id: evaluation.id,
      position,
      metadata: without(evaluation, ["id"]),
    }),
  );
  for (const [key, values] of Object.entries(db.rules))
    add("permission_rules", { key, values });
  for (const [key, value] of Object.entries(db.idempotency!))
    add("idempotency_records", {
      key,
      fingerprint: value.fingerprint,
      expires_at: value.expiresAt,
      result: value.result,
    });
  return tables;
}
const metadata = (row: SqlRow) =>
  (row.metadata ?? {}) as Record<string, unknown>;
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);
export function hydrateState(
  tables: Record<string, SqlRow[]>,
  tenant: string,
): Db {
  const sorted = (table: string) =>
    [...tables[table]].sort(
      (a, b) =>
        Number(a.position ?? a.ordinal ?? a.sequence) -
        Number(b.position ?? b.ordinal ?? b.sequence),
    );
  const settings = tables.workspace_settings[0];
  if (!settings) throw new Error("TENANT_NOT_INITIALIZED");
  const versions = sorted("document_versions");
  const chunks = sorted("chunks");
  const messages = sorted("messages");
  const db = {
    ...(settings.legacy_root as object),
    settings: settings.values,
    bases: sorted("knowledge_bases").map((row) => ({
      ...metadata(row),
      id: row.id,
      name: row.name,
      revision: Number(row.revision),
      tenantId: tenant,
    })),
    members: sorted("legacy_members").map((row) => ({
      ...metadata(row),
      id: row.id,
      role: row.role,
      revision: Number(row.revision),
      tenantId: tenant,
    })),
    files: Object.fromEntries(
      tables.file_artifacts.map((row) => [
        String(row.id),
        {
          ...metadata(row),
          id: row.id,
          name: row.name,
          size: Number(row.size_bytes),
          sha256: row.sha256,
          mediaType: row.media_type,
          createdAt: iso(row.created_at),
          ...(row.uploader_membership_id
            ? { uploaderMembershipId: row.uploader_membership_id }
            : {}),
        },
      ]),
    ),
    documents: sorted("documents").map((row) => ({
      ...metadata(row),
      id: row.id,
      baseId: row.base_id,
      name: row.name,
      status: row.status,
      publishedVersionId: row.published_version_id,
      revision: Number(row.revision),
      tenantId: tenant,
      ...(row.source_artifact_id
        ? { sourceArtifactId: row.source_artifact_id }
        : {}),
      chunks: sorted("document_working_chunks")
        .filter((chunk) => chunk.document_id === row.id)
        .map((chunk) => chunk.content),
      versions: versions
        .filter((version) => version.document_id === row.id)
        .map((version) => ({
          ...metadata(version),
          id: version.id,
          version: version.version_label,
          ...(version.source_artifact_id
            ? { sourceArtifactId: version.source_artifact_id }
            : {}),
          chunks: chunks
            .filter((chunk) => chunk.version_id === version.id)
            .map((chunk) => chunk.content),
          chunkIds: chunks
            .filter((chunk) => chunk.version_id === version.id)
            .map((chunk) => chunk.id),
        })),
    })),
    tasks: sorted("processing_tasks").map(
      (row) =>
        ({
          ...metadata(row),
          id: row.id,
          docId: row.document_id,
          ...(row.superseded_by ? { supersededBy: row.superseded_by } : {}),
          ...(row.job_snapshot
            ? {
                job: {
                  ...(row.job_snapshot as object),
                  kind: row.kind,
                  state: row.state,
                  version: versions.find(
                    (version) => version.id === row.version_id,
                  )?.version_label,
                  events: sorted("task_events")
                    .filter((event) => event.task_id === row.id)
                    .map((event) => ({
                      sequence: Number(event.sequence),
                      time: iso(event.time),
                      type: event.type,
                      message: event.message,
                    })),
                },
              }
            : {}),
        }) as ProcessingTask,
    ),
    conversations: sorted("conversations").map((row) => ({
      ...metadata(row),
      id: row.id,
      title: row.title,
      ...(row.owner_membership_id
        ? { ownerMembershipId: row.owner_membership_id }
        : {}),
      messages: messages
        .filter((message) => message.conversation_id === row.id)
        .map((message) => ({
          ...metadata(message),
          id: message.id,
          role: message.role,
          content: message.content,
        })),
    })),
    auditLogs: sorted("audit_events").map((row) => ({
      ...metadata(row),
      id: row.id,
      action: row.action,
      actorKind: row.actor_kind,
      ...(row.request_id ? { requestId: row.request_id } : {}),
    })),
    evaluations: sorted("evaluation_runs").map((row) => ({
      ...metadata(row),
      id: row.id,
    })),
    rules: Object.fromEntries(
      tables.permission_rules.map((row) => [String(row.key), row.values]),
    ),
    idempotency: Object.fromEntries(
      tables.idempotency_records.map((row) => [
        String(row.key),
        {
          fingerprint: row.fingerprint,
          expiresAt: iso(row.expires_at),
          result: row.result,
        },
      ]),
    ),
  } as Db;
  return normalizeState(db, tenant);
}
