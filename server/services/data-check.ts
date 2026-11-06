import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir } from "node:fs/promises";
import { join } from "node:path";
import { fileArtifact, memberInput, role } from "../../shared/contracts.js";
import type { FileArtifact } from "./files.js";
import { validateChunks } from "../../shared/text-limits.js";

type Row = Record<string, unknown>;
type Severity = "error" | "warning" | "incomplete";
export interface DataIssue {
  severity: Severity;
  code: string;
  location: string;
  relatedLocation?: string;
}
export interface DataCheckReport {
  schemaVersion: 1;
  scope: "json-integrity-preflight";
  status: "passed" | "warnings" | "failed" | "incomplete";
  migrationReady: "not_assessed";
  sourceSha256?: string;
  counts: Record<string, number>;
  totals: Record<Severity, number>;
  issueCounts: Record<string, number>;
  issues: DataIssue[];
  issuesTruncated: boolean;
  fileVerification:
    "not_requested" | "not_applicable" | "passed" | "failed" | "incomplete";
  pendingMigrationChecks: string[];
}
const collections = [
  "bases",
  "documents",
  "tasks",
  "members",
  "conversations",
  "auditLogs",
  "evaluations",
] as const;
const requiredTextFields: Record<string, string[]> = {
  bases: ["name", "description", "color", "owner", "access"],
  documents: [
    "name",
    "category",
    "status",
    "type",
    "size",
    "owner",
    "date",
    "department",
    "level",
    "strategy",
    "task",
  ],
  tasks: ["docId", "docName", "status", "updatedAt"],
  members: ["name", "email", "department", "role"],
  conversations: ["title", "createdAt", "updatedAt"],
  auditLogs: [
    "time",
    "user",
    "department",
    "action",
    "content",
    "source",
    "status",
  ],
  evaluations: ["name", "dataset", "status", "createdAt"],
};
const object = (value: unknown): Row | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : undefined;
const string = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const timestamp = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));

function inspection(input: unknown, now = new Date()) {
  const report: DataCheckReport = {
    schemaVersion: 1,
    scope: "json-integrity-preflight",
    status: "passed",
    migrationReady: "not_assessed",
    counts: {},
    totals: { error: 0, warning: 0, incomplete: 0 },
    issueCounts: {},
    issues: [],
    issuesTruncated: false,
    fileVerification: "not_requested",
    pendingMigrationChecks: [
      "database_selection",
      "verified_identity_mapping",
      "resource_grants_mapping",
      "sql_transaction_dry_run",
    ],
  };
  const issue = (
    severity: Severity,
    code: string,
    location: string,
    relatedLocation?: string,
  ) => {
    report.totals[severity]++;
    report.issueCounts[code] = (report.issueCounts[code] ?? 0) + 1;
    if (report.issues.length < 200)
      report.issues.push({
        severity,
        code,
        location,
        ...(relatedLocation ? { relatedLocation } : {}),
      });
    else {
      report.issuesTruncated = true;
      const replace = report.issues.findIndex((item) =>
        severity === "error"
          ? item.severity !== "error"
          : severity === "incomplete" && item.severity === "warning",
      );
      if (replace >= 0)
        report.issues[replace] = {
          severity,
          code,
          location,
          ...(relatedLocation ? { relatedLocation } : {}),
        };
    }
  };
  const finish = () => {
    report.status = report.totals.error
      ? "failed"
      : report.totals.incomplete
        ? "incomplete"
        : report.totals.warning
          ? "warnings"
          : "passed";
    return report;
  };
  const artifacts: Array<{ artifact: FileArtifact; location: string }> = [];
  const db = object(input);
  if (!db) {
    issue("error", "INVALID_ROOT", "root");
    return { report, issue, finish, artifacts };
  }
  const recognizedRootFields = new Set<string>([
    ...collections,
    "files",
    "idempotency",
    "settings",
    "rules",
    "rulesRevision",
  ]);
  report.counts.unknownRootFields = Object.keys(db).filter(
    (key) => !recognizedRootFields.has(key),
  ).length;
  if (report.counts.unknownRootFields)
    issue("warning", "UNKNOWN_ROOT_FIELDS", "root");
  const tables = new Map<string, Row[]>();
  const locations = new WeakMap<Row, string>();
  const indexes = new Map<
    string,
    Map<string, { row: Row; location: string }>
  >();
  for (const name of collections) {
    const value = db[name];
    const rows: Row[] = [];
    const ids = new Map<string, { row: Row; location: string }>();
    if (!Array.isArray(value))
      issue("error", "MISSING_OR_INVALID_COLLECTION", name);
    else
      value.forEach((item, index) => {
        const location = `${name}[${index}]`;
        const row = object(item);
        if (!row) {
          issue("error", "INVALID_RECORD", location);
          return;
        }
        rows.push(row);
        locations.set(row, location);
        if (
          requiredTextFields[name].some(
            (field) => typeof row[field] !== "string",
          )
        )
          issue("error", "INVALID_RECORD_FIELDS", location);
        if (!string(row.id)) issue("error", "MISSING_ID", location);
        else if (ids.has(row.id))
          issue("error", "DUPLICATE_ID", location, ids.get(row.id)!.location);
        else ids.set(row.id, { row, location });
        if (
          row.revision !== undefined &&
          (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1)
        )
          issue("error", "INVALID_REVISION", location);
      });
    report.counts[name] = Array.isArray(value) ? value.length : 0;
    tables.set(name, rows);
    indexes.set(name, ids);
  }
  const rows = (name: string) => tables.get(name) ?? [];
  const ids = (name: string) => indexes.get(name)!;
  const names = new Map<string, string[]>();
  const normalizedNames = new Map<string, string>();
  rows("bases").forEach((base, index) => {
    const location = locations.get(base) ?? `bases[${index}]`;
    if (!string(base.name)) {
      issue("error", "INVALID_BASE_NAME", location);
      return;
    }
    const normalized = base.name.normalize("NFKC").toLowerCase();
    const previous = normalizedNames.get(normalized);
    if (previous) issue("error", "DUPLICATE_BASE_NAME", location, previous);
    else normalizedNames.set(normalized, location);
    names.set(base.name, [...(names.get(base.name) ?? []), location]);
  });

  const fileRows = db.files === undefined ? {} : object(db.files);
  if (!fileRows) issue("error", "INVALID_FILES_COLLECTION", "files");
  const knownArtifacts = new Set<string>();
  Object.entries(fileRows ?? {}).forEach(([id, value], index) => {
    const location = `files[${index}]`;
    const parsed = fileArtifact.safeParse(value);
    if (!parsed.success || parsed.data.id !== id) {
      issue("error", "INVALID_FILE_METADATA", location);
      return;
    }
    knownArtifacts.add(id);
    artifacts.push({ artifact: parsed.data, location });
  });
  report.counts.files = Object.keys(fileRows ?? {}).length;
  const referencedFiles = new Set<string>();
  const referenceFile = (value: unknown, location: string) => {
    if (value === undefined) return;
    if (!string(value) || !knownArtifacts.has(value))
      issue("error", "MISSING_FILE_REFERENCE", location);
    else referencedFiles.add(value);
  };
  const versionIds = new Map<string, string>();
  const chunkIds = new Map<string, string>();
  const versionsByDocument = new Map<string, Set<string>>();
  let versionCount = 0,
    chunkCount = 0;
  rows("documents").forEach((doc, index) => {
    const location = locations.get(doc) ?? `documents[${index}]`;
    if (doc.baseId !== undefined) {
      const parent =
        typeof doc.baseId === "string"
          ? ids("bases").get(doc.baseId)
          : undefined;
      if (!parent) issue("error", "MISSING_BASE_REFERENCE", location);
      else if (doc.category !== parent.row.name)
        issue("warning", "BASE_LABEL_MISMATCH", location);
    } else {
      const matches =
        typeof doc.category === "string" ? (names.get(doc.category) ?? []) : [];
      if (matches.length !== 1)
        issue(
          "error",
          matches.length ? "AMBIGUOUS_BASE_RELATION" : "MISSING_BASE_RELATION",
          location,
        );
      else issue("warning", "LEGACY_BASE_RELATION", location);
    }
    if (
      !["草稿", "已发布", "已归档"].includes(String(doc.status)) ||
      !["running", "done", "error"].includes(String(doc.task))
    )
      issue("error", "INVALID_DOCUMENT_STATE", location);
    if (!strings(doc.chunks))
      issue("error", "INVALID_DOCUMENT_CHUNKS", location);
    referenceFile(doc.sourceArtifactId, location);
    if (
      /^(PDF|DOCX?|PPTX?|XLSX?|MD|TXT|PNG|JPE?G|WEBP)$/i.test(
        String(doc.type),
      ) &&
      doc.sourceArtifactId === undefined &&
      (!Array.isArray(doc.versions) ||
        !doc.versions.some(
          (version) => object(version)?.sourceArtifactId !== undefined,
        ))
    )
      issue("warning", "LEGACY_ORIGINAL_FILE_UNAVAILABLE", location);
    if (!Array.isArray(doc.versions) || !doc.versions.length) {
      issue("error", "MISSING_VERSIONS", location);
      return;
    }
    const labels = new Set<string>();
    doc.versions.forEach((value, versionIndex) => {
      const path = `${location}.versions[${versionIndex}]`;
      const version = object(value);
      versionCount++;
      if (!version) {
        issue("error", "INVALID_VERSION", path);
        return;
      }
      if (
        typeof version.version !== "string" ||
        !/^v\d+\.\d+$/.test(version.version)
      )
        issue("error", "INVALID_VERSION_LABEL", path);
      else if (labels.has(version.version))
        issue("error", "DUPLICATE_VERSION_LABEL", path);
      else labels.add(version.version);
      if (version.id === undefined) issue("warning", "LEGACY_VERSION_ID", path);
      else if (!string(version.id)) issue("error", "INVALID_VERSION_ID", path);
      else if (versionIds.has(version.id))
        issue(
          "error",
          "DUPLICATE_VERSION_ID",
          path,
          versionIds.get(version.id),
        );
      else versionIds.set(version.id, path);
      referenceFile(version.sourceArtifactId, path);
      if (!strings(version.chunks)) {
        issue("error", "INVALID_VERSION_CHUNKS", path);
        return;
      }
      chunkCount += version.chunks.length;
      const versionChunks = version.chunks;
      if (
        versionIndex === 0 &&
        strings(doc.chunks) &&
        (doc.chunks.length !== version.chunks.length ||
          doc.chunks.some((chunk, i) => chunk !== versionChunks[i]))
      )
        issue("error", "CURRENT_VERSION_CONTENT_MISMATCH", path);
      if (version.chunkIds === undefined)
        issue("warning", "LEGACY_CHUNK_IDS", path);
      else if (
        !strings(version.chunkIds) ||
        version.chunkIds.length !== version.chunks.length
      )
        issue("error", "INVALID_CHUNK_IDS", path);
      else
        version.chunkIds.forEach((id, chunkIndex) => {
          const chunkPath = `${path}.chunks[${chunkIndex}]`;
          if (!string(id)) issue("error", "INVALID_CHUNK_ID", chunkPath);
          else if (chunkIds.has(id))
            issue("error", "DUPLICATE_CHUNK_ID", chunkPath, chunkIds.get(id));
          else chunkIds.set(id, chunkPath);
        });
    });
    if (string(doc.id)) versionsByDocument.set(doc.id, labels);
  });
  report.counts.versions = versionCount;
  report.counts.versionChunks = chunkCount;
  artifacts.forEach(({ artifact, location }) => {
    if (!referencedFiles.has(artifact.id))
      issue("warning", "UNREFERENCED_FILE_RECORD", location);
  });

  const activeJobs = new Map<string, string>();
  rows("tasks").forEach((task, index) => {
    const location = locations.get(task) ?? `tasks[${index}]`;
    if (
      !["running", "done", "error"].includes(String(task.status)) ||
      !Number.isInteger(task.stage) ||
      Number(task.stage) < 0
    )
      issue("error", "INVALID_TASK_STATE", location);
    const doc =
      typeof task.docId === "string"
        ? ids("documents").get(task.docId)?.row
        : undefined;
    if (!doc) issue("error", "TASK_DOCUMENT_MISSING", location);
    if (
      task.supersededBy !== undefined &&
      (typeof task.supersededBy !== "string" ||
        !ids("tasks").has(task.supersededBy))
    )
      issue("error", "TASK_SUCCESSOR_MISSING", location);
    else if (
      typeof task.supersededBy === "string" &&
      ids("tasks").get(task.supersededBy)?.row.docId !== task.docId
    )
      issue("error", "TASK_SUCCESSOR_DOCUMENT_MISMATCH", location);
    if (task.job === undefined) {
      issue("warning", "LEGACY_TASK_WITHOUT_JOB", location);
      return;
    }
    const job = object(task.job);
    if (!job) {
      issue("error", "INVALID_JOB", location);
      return;
    }
    const states = [
      "queued",
      "running",
      "retry_wait",
      "succeeded",
      "failed",
      "cancelled",
    ];
    if (!states.includes(String(job.state)))
      issue("error", "INVALID_JOB_STATE", location);
    if (!["prepare_text", "validate_chunks"].includes(String(job.kind)))
      issue("error", "INVALID_JOB_KIND", location);
    if (
      !Number.isSafeInteger(job.attempts) ||
      !Number.isSafeInteger(job.maxAttempts) ||
      Number(job.attempts) < 0 ||
      Number(job.maxAttempts) < 1 ||
      Number(job.attempts) > Number(job.maxAttempts)
    )
      issue("error", "INVALID_JOB_ATTEMPTS", location);
    if (!timestamp(job.availableAt))
      issue("error", "INVALID_JOB_TIME", location);
    if (job.kind === "prepare_text" && !string(job.inputText))
      issue("error", "MISSING_JOB_INPUT", location);
    if (job.kind === "validate_chunks") {
      try {
        if (!strings(job.inputChunks)) throw new Error();
        validateChunks(job.inputChunks);
      } catch {
        issue("error", "INVALID_JOB_CHUNKS", location);
      }
    }
    if (
      typeof task.docId === "string" &&
      (typeof job.version !== "string" ||
        !versionsByDocument.get(task.docId)?.has(job.version))
    )
      issue("error", "JOB_VERSION_MISSING", location);
    if (["queued", "running", "retry_wait"].includes(String(job.state))) {
      const key = JSON.stringify([task.docId, job.version]);
      if (activeJobs.has(key))
        issue("error", "DUPLICATE_ACTIVE_JOB", location, activeJobs.get(key));
      else activeJobs.set(key, location);
      if (
        Array.isArray(doc?.versions) &&
        object(doc.versions[0])?.version !== job.version
      )
        issue("warning", "STALE_ACTIVE_JOB", location);
    }
    if (job.state === "running") {
      if (!string(job.leaseToken) || !timestamp(job.leaseUntil))
        issue("error", "INVALID_RUNNING_LEASE", location);
      else if (Date.parse(String(job.leaseUntil)) <= now.getTime())
        issue("warning", "EXPIRED_RECOVERABLE_LEASE", location);
    }
    const expectedStatus =
      job.state === "succeeded"
        ? "done"
        : ["failed", "cancelled"].includes(String(job.state))
          ? "error"
          : "running";
    if (task.status !== expectedStatus)
      issue("error", "TASK_STATE_MISMATCH", location);
    if (job.checkpoint !== undefined) {
      const checkpoint = object(job.checkpoint);
      if (
        !checkpoint ||
        !["parsed", "chunked"].includes(String(checkpoint.stage)) ||
        (checkpoint.stage === "chunked" && !strings(checkpoint.chunks))
      )
        issue("error", "INVALID_CHECKPOINT", location);
      else if (checkpoint.stage === "chunked") {
        try {
          validateChunks(checkpoint.chunks as string[]);
        } catch {
          issue("error", "INVALID_CHECKPOINT", location);
        }
      }
    }
    if (!Array.isArray(job.events))
      issue("error", "MISSING_JOB_EVENTS", location);
    else {
      let previous = 0;
      job.events.forEach((value, eventIndex) => {
        const event = object(value);
        if (
          !event ||
          !Number.isSafeInteger(event.sequence) ||
          Number(event.sequence) <= previous ||
          !timestamp(event.time)
        )
          issue(
            "error",
            "INVALID_JOB_EVENT",
            `${location}.events[${eventIndex}]`,
          );
        if (event && Number.isSafeInteger(event.sequence))
          previous = Number(event.sequence);
      });
    }
  });

  const processedTasks = new Set<string>();
  for (const [id] of ids("tasks")) {
    const chain = new Set<string>();
    let cursor: string | undefined = id;
    while (cursor && ids("tasks").has(cursor) && !processedTasks.has(cursor)) {
      if (chain.has(cursor)) {
        issue(
          "error",
          "TASK_SUCCESSOR_CYCLE",
          ids("tasks").get(cursor)!.location,
        );
        break;
      }
      chain.add(cursor);
      const next: unknown = ids("tasks").get(cursor)!.row.supersededBy;
      cursor = typeof next === "string" ? next : undefined;
    }
    for (const item of chain) processedTasks.add(item);
  }
  const emails = new Map<string, string>();
  rows("members").forEach((member, index) => {
    const location = locations.get(member) ?? `members[${index}]`;
    const email = memberInput.shape.email.safeParse(member.email);
    if (!email.success) issue("error", "INVALID_MEMBER_EMAIL", location);
    else if (emails.has(email.data))
      issue(
        "error",
        "DUPLICATE_MEMBER_EMAIL",
        location,
        emails.get(email.data),
      );
    else emails.set(email.data, location);
    if (!role.safeParse(member.role).success)
      issue("warning", "MEMBER_ROLE_MAPPING_REQUIRED", location);
  });
  const messageIds = new Map<string, string>();
  let messageCount = 0;
  rows("conversations").forEach((conversation, index) => {
    const location = locations.get(conversation) ?? `conversations[${index}]`;
    if (!Array.isArray(conversation.messages)) {
      issue("error", "INVALID_MESSAGES", location);
      return;
    }
    conversation.messages.forEach((value, messageIndex) => {
      const message = object(value);
      messageCount++;
      const path = `${location}.messages[${messageIndex}]`;
      if (
        !message ||
        !string(message.id) ||
        !["user", "assistant"].includes(String(message.role)) ||
        typeof message.content !== "string"
      ) {
        issue("error", "INVALID_MESSAGE", path);
        return;
      }
      if (messageIds.has(message.id))
        issue(
          "error",
          "DUPLICATE_MESSAGE_ID",
          path,
          messageIds.get(message.id),
        );
      else messageIds.set(message.id, path);
      const permission = object(message.permission);
      if (
        permission &&
        (permission.status !== "not_configured" ||
          (Array.isArray(permission.checked) && permission.checked.length))
      )
        issue("warning", "LEGACY_PERMISSION_CLAIM", path);
    });
  });
  report.counts.messages = messageCount;
  rows("auditLogs").forEach((log, index) => {
    const location = locations.get(log) ?? `auditLogs[${index}]`;
    if (!strings(log.docs)) issue("error", "INVALID_AUDIT_RESOURCES", location);
    if (!timestamp(log.time))
      issue(
        log.schemaVersion === 1 ? "error" : "warning",
        "UNVERIFIED_AUDIT_TIME",
        location,
      );
    if (log.schemaVersion !== undefined && log.schemaVersion !== 1)
      issue("warning", "UNKNOWN_AUDIT_SCHEMA", location);
    if (
      log.conversationId &&
      typeof log.conversationId === "string" &&
      !ids("conversations").has(log.conversationId)
    )
      issue("warning", "RETAINED_AUDIT_CONVERSATION_UNAVAILABLE", location);
    if (
      log.messageId &&
      typeof log.messageId === "string" &&
      !messageIds.has(log.messageId)
    )
      issue("warning", "RETAINED_AUDIT_MESSAGE_UNAVAILABLE", location);
  });
  rows("evaluations").forEach((evaluation, index) => {
    const location = locations.get(evaluation) ?? `evaluations[${index}]`;
    const metrics = object(evaluation.metrics);
    if (
      !metrics ||
      ["hitRate", "accuracy", "latency", "coverage"].some(
        (field) =>
          typeof metrics[field] !== "number" ||
          !Number.isFinite(metrics[field]),
      )
    )
      issue("error", "INVALID_EVALUATION_METRICS", location);
    if (!Array.isArray(evaluation.records))
      issue("error", "INVALID_EVALUATION_RECORDS", location);
    else
      evaluation.records.forEach((value, recordIndex) => {
        const sample = object(value);
        if (
          !sample ||
          !string(sample.id) ||
          typeof sample.question !== "string" ||
          typeof sample.expected !== "string" ||
          typeof sample.hit !== "boolean" ||
          typeof sample.score !== "number" ||
          !Number.isFinite(sample.score) ||
          typeof sample.latency !== "number" ||
          !Number.isFinite(sample.latency)
        )
          issue(
            "error",
            "INVALID_EVALUATION_SAMPLE",
            `${location}.records[${recordIndex}]`,
          );
      });
  });
  const settings = object(db.settings);
  if (
    db.rulesRevision !== undefined &&
    (!Number.isSafeInteger(db.rulesRevision) || Number(db.rulesRevision) < 1)
  )
    issue("error", "INVALID_RULES_REVISION", "rulesRevision");
  if (!settings || !string(settings.workspace) || !string(settings.tenant))
    issue("error", "INVALID_SETTINGS", "settings");
  else {
    if (
      settings.revision !== undefined &&
      (!Number.isSafeInteger(settings.revision) ||
        Number(settings.revision) < 1)
    )
      issue("error", "INVALID_SETTINGS_REVISION", "settings");
    const size = Number(settings.chunkSize),
      overlap = Number(settings.overlap),
      topK = Number(settings.topK);
    if (
      !Number.isInteger(size) ||
      size < 64 ||
      size > 4096 ||
      !Number.isInteger(overlap) ||
      overlap < 0 ||
      overlap >= size ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 20
    )
      issue("error", "INVALID_PROCESSING_SETTINGS", "settings");
  }
  if (!object(db.rules)) issue("error", "INVALID_RULES", "rules");
  else {
    Object.values(db.rules as Row).forEach((value, index) => {
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        value.some((item) => typeof item !== "boolean")
      )
        issue("error", "INVALID_RULE_VALUES", `rules[${index}]`);
    });
    if (Object.keys(db.rules as Row).length)
      issue("warning", "RESOURCE_GRANTS_MAPPING_REQUIRED", "rules");
  }
  if (rows("members").length || rows("conversations").length)
    issue("warning", "VERIFIED_IDENTITY_MAPPING_REQUIRED", "root");
  if (db.idempotency !== undefined) {
    const records = object(db.idempotency);
    if (!records) issue("error", "INVALID_IDEMPOTENCY_RECORDS", "idempotency");
    else
      Object.values(records).forEach((value, index) => {
        const item = object(value);
        if (
          !item ||
          typeof item.fingerprint !== "string" ||
          !/^[a-f0-9]{64}$/.test(item.fingerprint) ||
          !timestamp(item.expiresAt) ||
          !("result" in item)
        )
          issue("error", "INVALID_IDEMPOTENCY_RECORD", `idempotency[${index}]`);
      });
  }
  return { report, issue, finish, artifacts };
}

/** Pure, bounded diagnostics. Never returns business values or mutates the supplied object. */
export function inspectData(input: unknown, now?: Date): DataCheckReport {
  const result = inspection(input, now);
  if (result.artifacts.length)
    result.issue("incomplete", "FILE_BYTES_NOT_CHECKED", "files");
  else
    result.report.fileVerification =
      result.report.issueCounts.INVALID_FILES_COLLECTION ||
      result.report.issueCounts.INVALID_FILE_METADATA
        ? "failed"
        : "not_applicable";
  return result.finish();
}

export async function readRegularFile(path: string, maxBytes: number) {
  if (!constants.O_NOFOLLOW) throw new Error("NOFOLLOW_UNAVAILABLE");
  const info = await lstat(path, { bigint: true });
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("NOT_REGULAR_FILE");
  if (info.size > BigInt(maxBytes)) throw new Error("SIZE_LIMIT");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.ino !== info.ino || before.dev !== info.dev)
      throw new Error("FILE_CHANGED");
    const parts: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes - size + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, size);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maxBytes) throw new Error("SIZE_LIMIT");
      parts.push(chunk.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.size !== BigInt(size)
    )
      throw new Error("FILE_CHANGED");
    return { bytes: Buffer.concat(parts, size), identity: after };
  } finally {
    await handle.close();
  }
}

export async function checkDataFile(options: {
  input: string;
  filesDirectory?: string;
  maxBytes?: number;
  now?: Date;
}): Promise<DataCheckReport> {
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 256 * 1024 * 1024
  )
    throw new Error("INVALID_SIZE_BUDGET");
  let source: Awaited<ReturnType<typeof readRegularFile>>;
  try {
    source = await readRegularFile(options.input, maxBytes);
  } catch (error) {
    const result = inspection(undefined, options.now);
    result.report.totals.error = 0;
    result.report.issues = [];
    result.report.issueCounts = {};
    const known =
      error instanceof Error &&
      [
        "NOT_REGULAR_FILE",
        "SIZE_LIMIT",
        "FILE_CHANGED",
        "NOFOLLOW_UNAVAILABLE",
      ].includes(error.message)
        ? error.message
        : "UNREADABLE_INPUT";
    result.issue("incomplete", known, "input");
    return result.finish();
  }
  let input: unknown;
  try {
    input = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(source.bytes),
    );
  } catch {
    const result = inspection(undefined, options.now);
    result.report.issues = [];
    result.report.totals.error = 0;
    result.report.issueCounts = {};
    result.issue("error", "INVALID_JSON_OR_ENCODING", "input");
    return result.finish();
  }
  const result = inspection(input, options.now);
  const { report, issue, artifacts } = result;
  report.sourceSha256 = createHash("sha256").update(source.bytes).digest("hex");
  if (!options.filesDirectory) {
    if (artifacts.length)
      issue("incomplete", "FILE_BYTES_NOT_CHECKED", "files");
    else
      report.fileVerification =
        report.issueCounts.INVALID_FILES_COLLECTION ||
        report.issueCounts.INVALID_FILE_METADATA
          ? "failed"
          : "not_applicable";
  } else {
    report.fileVerification = "incomplete";
    const fileErrorsBefore = report.totals.error;
    const invalidFileMetadata = !!(
      report.issueCounts.INVALID_FILES_COLLECTION ||
      report.issueCounts.INVALID_FILE_METADATA
    );
    try {
      const directory = await lstat(options.filesDirectory, { bigint: true });
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new Error("INVALID_DIRECTORY");
      const digests = new Map<string, number>();
      for (const { artifact, location } of artifacts) {
        const seen = digests.get(artifact.sha256);
        if (seen !== undefined) {
          if (seen !== artifact.size)
            issue("error", "INCONSISTENT_FILE_SIZE", location);
          continue;
        }
        digests.set(artifact.sha256, artifact.size);
        try {
          const blob = await readRegularFile(
            join(options.filesDirectory, artifact.sha256),
            artifact.size,
          );
          if (
            blob.bytes.length !== artifact.size ||
            createHash("sha256").update(blob.bytes).digest("hex") !==
              artifact.sha256
          )
            issue("error", "BLOB_INTEGRITY_ERROR", location);
        } catch {
          issue("error", "BLOB_MISSING_UNSAFE_OR_CHANGED", location);
        }
      }
      let index = 0,
        orphanCount = 0;
      const entries = await opendir(options.filesDirectory);
      for await (const entry of entries) {
        if (index >= 50_000) {
          issue("incomplete", "DIRECTORY_SCAN_LIMIT", "fileBlobs");
          break;
        }
        const location = `fileBlobs[${index++}]`;
        if (!entry.isFile()) {
          issue("warning", "IGNORED_NON_FILE_ENTRY", location);
          continue;
        }
        if (!/^[a-f0-9]{64}$/.test(entry.name)) {
          issue("warning", "UNRECOGNIZED_FILE_ENTRY", location);
          continue;
        }
        if (!digests.has(entry.name)) {
          orphanCount++;
          issue("warning", "UNREFERENCED_BLOB", location);
        }
      }
      report.counts.unreferencedBlobs = orphanCount;
      report.counts.uniqueBlobs = digests.size;
      const after = await lstat(options.filesDirectory, { bigint: true });
      if (
        after.ino !== directory.ino ||
        after.dev !== directory.dev ||
        after.mtimeNs !== directory.mtimeNs
      )
        issue("incomplete", "FILES_DIRECTORY_CHANGED", "files");
      else if (invalidFileMetadata || report.totals.error > fileErrorsBefore)
        report.fileVerification = "failed";
      else if (!report.totals.incomplete) report.fileVerification = "passed";
    } catch {
      issue("incomplete", "UNREADABLE_OR_UNSAFE_FILES_DIRECTORY", "files");
    }
  }
  try {
    const after = await lstat(options.input, { bigint: true });
    if (
      after.ino !== source.identity.ino ||
      after.dev !== source.identity.dev ||
      after.size !== source.identity.size ||
      after.mtimeNs !== source.identity.mtimeNs ||
      after.ctimeNs !== source.identity.ctimeNs ||
      after.isSymbolicLink()
    )
      issue("incomplete", "INPUT_CHANGED_DURING_CHECK", "input");
  } catch {
    issue("incomplete", "INPUT_CHANGED_DURING_CHECK", "input");
  }
  return result.finish();
}
