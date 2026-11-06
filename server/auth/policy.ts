import type { Db, KnowledgeDocument } from "../types.js";
import type { Principal } from "./service.js";
import { AppError } from "../http/errors.js";
import { canonical } from "../db/state-mapping.js";
import { publicationFields } from "../services/consistency.js";

export interface Operation {
  method: string;
  path: string;
  body: Record<string, unknown>;
}
const denied = () => new AppError(403, "FORBIDDEN", "没有访问此资源的权限");
const missing = () => new AppError(404, "NOT_FOUND", "资源不存在或不可访问");
export function allowed(p: Principal, base: string, permission: string) {
  return (
    p.capabilities.includes(permission) &&
    Array.isArray(p.grants[base]) &&
    p.grants[base].includes(permission)
  );
}
export const requireCapability = (p: Principal, name: string) => {
  if (!p.capabilities.includes(name)) throw denied();
};
const cap = requireCapability;
function requireBase(p: Principal, base: string, permission: string) {
  if (!allowed(p, base, permission)) throw denied();
}
export function publicDocument(
  doc: KnowledgeDocument,
): KnowledgeDocument | undefined {
  if (doc.status !== "已发布" || !doc.publishedVersionId) return undefined;
  const version = doc.versions.find(
    (item) => item.id === doc.publishedVersionId,
  );
  if (!version?.chunks.length) return undefined;
  return {
    ...Object.fromEntries(
      publicationFields.map((key) => [key, doc.publishedMetadata?.[key] ?? ""]),
    ),
    id: doc.id,
    baseId: doc.baseId,
    tenantId: doc.tenantId,
    revision: doc.revision,
    status: "已发布",
    category: doc.category,
    publishedVersionId: doc.publishedVersionId,
    chunks: [...version.chunks],
    versions: [structuredClone(version)],
    sourceArtifactId: version.sourceArtifactId,
    task: "done",
    stage: 3,
  } as KnowledgeDocument;
}
export function documentVisible(
  p: Principal,
  doc: KnowledgeDocument,
  retrieval = false,
) {
  if (!retrieval && allowed(p, doc.baseId!, "write"))
    return structuredClone(doc);
  return allowed(p, doc.baseId!, "read") ? publicDocument(doc) : undefined;
}
export function authorize(p: Principal, db: Db, operation: Operation) {
  const method = operation.method === "HEAD" ? "GET" : operation.method;
  const path = operation.path.replace(/\/$/, "");
  const body = operation.body;
  if (path === "/api/overview" && method === "GET") return;
  if (path === "/api/settings") {
    if (method !== "GET") cap(p, "workspace.manage");
    return;
  }
  if (path.startsWith("/api/permissions")) {
    cap(p, "workspace.manage");
    if (method !== "GET")
      throw new AppError(
        409,
        "LEGACY_CONFIG_READ_ONLY",
        "旧成员和矩阵不执行授权，请使用账户与知识库授权管理",
      );
    return;
  }
  if (path.startsWith("/api/audit")) {
    cap(p, "audit.read");
    return;
  }
  if (path.startsWith("/api/evaluations")) {
    cap(p, "workspace.manage");
    return;
  }
  if (path === "/api/retrieval/search" && method === "POST") return;
  if (path === "/api/conversations") return;
  const conversation = /^\/api\/conversations\/([^/]+)/.exec(path);
  if (conversation) {
    const found = db.conversations.find(
      (item) => item.id === decodeURIComponent(conversation[1]),
    );
    if (!found || found.ownerMembershipId !== p.memberId) throw missing();
    return;
  }
  if (path === "/api/knowledge/bases") {
    if (method === "POST") cap(p, "base.create");
    return;
  }
  const base = /^\/api\/knowledge\/bases\/([^/]+)$/.exec(path);
  if (base) {
    requireBase(p, decodeURIComponent(base[1]), "manage");
    return;
  }
  if (path === "/api/knowledge/documents/import") {
    const target = db.bases.find((item) =>
      typeof body.baseId === "string"
        ? item.id === body.baseId
        : item.name === (body.category ?? "企业制度"),
    );
    if (!target) throw missing();
    requireBase(p, target.id, "write");
    if (
      body.mode === "file" &&
      db.files?.[String(body.artifactId)]?.uploaderMembershipId !== p.memberId
    )
      throw denied();
    return;
  }
  if (
    ["/api/knowledge/documents", "/api/knowledge/tasks"].includes(path) &&
    method === "GET"
  )
    return;
  const document = /^\/api\/knowledge\/documents\/([^/]+)(?:\/(.*))?$/.exec(
    path,
  );
  if (document) {
    const doc = db.documents.find(
      (item) => item.id === decodeURIComponent(document[1]),
    );
    if (!doc) throw missing();
    if (method === "GET") {
      if (!documentVisible(p, doc)) throw missing();
      return;
    }
    requireBase(
      p,
      doc.baseId!,
      ["publish", "archive"].includes(document[2]) ? "publish" : "write",
    );
    if (body.baseId !== undefined || body.category !== undefined) {
      const target = db.bases.find((item) =>
        typeof body.baseId === "string"
          ? item.id === body.baseId
          : item.name === body.category,
      );
      if (!target) throw missing();
      requireBase(p, target.id, "write");
      if (doc.baseId !== target.id && doc.publishedVersionId) {
        requireBase(p, doc.baseId!, "publish");
        requireBase(p, target.id, "publish");
      }
    }
    return;
  }
  const task = /^\/api\/knowledge\/tasks\/([^/]+)/.exec(path);
  if (task) {
    const found = db.tasks.find(
      (item) => item.id === decodeURIComponent(task[1]),
    );
    const doc = db.documents.find((item) => item.id === found?.docId);
    if (!doc) throw missing();
    if (method === "GET") {
      if (!documentVisible(p, doc)) throw missing();
    } else requireBase(p, doc.baseId!, "write");
    return;
  }
  if (path === "/api/knowledge/files" && method === "POST") {
    cap(p, "upload");
    return;
  }
  const file = /^\/api\/knowledge\/files\/([^/]+)\/download$/.exec(path);
  if (file) {
    const id = decodeURIComponent(file[1]);
    if (
      !db.documents.some((doc) => {
        const visible = documentVisible(p, doc);
        return (
          visible &&
          (visible.sourceArtifactId === id ||
            visible.versions.some((version) => version.sourceArtifactId === id))
        );
      })
    )
      throw missing();
    return;
  }
  throw denied();
}
export function visibleState(p: Principal, db: Db, operation: Operation): Db {
  const view = structuredClone(db);
  const retrieval =
    operation.path.startsWith("/api/conversations") ||
    operation.path === "/api/retrieval/search";
  view.bases = db.bases.filter(
    (base) =>
      p.capabilities.includes("workspace.manage") ||
      Object.keys(p.grants).includes(base.id),
  );
  view.documents = db.documents.flatMap((doc) => {
    const visible = documentVisible(p, doc, retrieval);
    return visible ? [visible] : [];
  });
  // Publishing needs its target draft internally; response projection still requires read/write.
  const publish =
    /^\/api\/knowledge\/documents\/([^/]+)\/(publish|archive)$/.exec(
      operation.path,
    );
  if (publish) {
    const target = db.documents.find(
      (doc) => doc.id === decodeURIComponent(publish[1]),
    );
    if (target && allowed(p, target.baseId!, "publish"))
      view.documents = [
        ...view.documents.filter((doc) => doc.id !== target.id),
        structuredClone(target),
      ];
  }
  const docs = new Set(view.documents.map((doc) => doc.id));
  view.tasks = db.tasks
    .filter((task) => docs.has(task.docId))
    .map((task) => ({
      ...task,
      docName: view.documents.find((doc) => doc.id === task.docId)!.name,
    }));
  view.files = Object.fromEntries(
    Object.entries(db.files ?? {}).filter(
      ([id, file]) =>
        file.uploaderMembershipId === p.memberId ||
        view.documents.some(
          (doc) =>
            doc.sourceArtifactId === id ||
            doc.versions.some((version) => version.sourceArtifactId === id),
        ),
    ),
  );
  view.members = p.capabilities.includes("workspace.manage")
    ? view.members
    : [];
  view.rules = p.capabilities.includes("workspace.manage") ? view.rules : {};
  view.evaluations = p.capabilities.includes("workspace.manage")
    ? view.evaluations
    : [];
  view.auditLogs = p.capabilities.includes("audit.read")
    ? view.auditLogs.map((log) =>
        log.schemaVersion === 1
          ? log
          : {
              ...log,
              content: "旧记录正文未通过当前资源授权核验",
              docs: [],
              user: "旧未核验主体",
            },
      )
    : [];
  view.conversations = view.conversations
    .filter((conversation) => conversation.ownerMembershipId === p.memberId)
    .map((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => {
        const lost =
          message.role === "assistant" &&
          (message.evidenceDocumentIds ?? []).some((id) => {
            const doc = db.documents.find((item) => item.id === id);
            return !doc || !documentVisible(p, doc, true);
          });
        return lost
          ? {
              ...message,
              content: "部分知识来源的访问权限已变更，请重新提问。",
              sources: [],
              retrieval: undefined,
            }
          : message;
      }),
    }));
  const prefix = `${p.tenantId}:${p.userId}:`;
  view.idempotency = Object.fromEntries(
    Object.entries(db.idempotency ?? {}).filter(([key]) =>
      key.startsWith(prefix),
    ),
  );
  return view;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Apply only changes to the visible projection; retain hidden records and unmodified redacted fields. */
export function mergeVisible(
  full: unknown,
  before: unknown,
  after: unknown,
): unknown {
  if (canonical(before) === canonical(after)) return structuredClone(full);
  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    Array.isArray(full) &&
    [...before, ...after, ...full].every(
      (item) => object(item) && typeof item.id === "string",
    )
  ) {
    const old = new Map(before.map((item) => [item.id, item]));
    const original = new Set(full.map((item) => item.id));
    for (const item of after)
      if (!old.has(item.id) && original.has(item.id)) throw denied();
    const originals = new Map(full.map((item) => [item.id, item]));
    const updated = after.map((item) =>
      old.has(item.id)
        ? mergeVisible(originals.get(item.id), old.get(item.id), item)
        : structuredClone(item),
    );
    const result: unknown[] = [];
    let index = 0;
    for (const item of full) {
      if (!old.has(item.id)) result.push(item);
      else if (index < updated.length) result.push(updated[index++]);
    }
    return [...result, ...updated.slice(index)];
  }
  if (object(before) && object(after) && object(full)) {
    const result = structuredClone(full);
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(after),
    ])) {
      if (!(key in after)) {
        delete result[key];
        continue;
      }
      result[key] =
        key in before
          ? mergeVisible(full[key], before[key], after[key])
          : structuredClone(after[key]);
    }
    return result;
  }
  return structuredClone(after);
}
export function safeResult(result: unknown, p: Principal, db: Db): unknown {
  if (!object(result)) return result;
  if (typeof result.id === "string" && Array.isArray(result.versions)) {
    const doc = db.documents.find((doc) => doc.id === result.id);
    if (!doc) throw missing();
    const visible = documentVisible(p, doc);
    if (!visible)
      return {
        id: doc.id,
        redacted: true,
        name: "",
        baseId: doc.baseId,
        category: "",
        type: "",
        size: "",
        owner: "",
        date: "",
        department: "",
        level: "",
        strategy: "",
        stage: doc.stage,
        task: doc.task,
        status: doc.status,
        revision: doc.revision,
        chunks: [],
        versions: [],
      };
    return visible;
  }
  if (typeof result.id === "string" && Array.isArray(result.messages)) {
    const view = visibleState(p, db, {
      method: "GET",
      path: "/api/conversations",
      body: {},
    }).conversations.find((conversation) => conversation.id === result.id);
    if (!view) throw missing();
    return view;
  }
  const output = { ...result };
  for (const key of ["document", "doc", "conversation"])
    if (output[key]) output[key] = safeResult(output[key], p, db);
  if (
    object(output.base) &&
    typeof output.base.id === "string" &&
    !p.capabilities.includes("workspace.manage") &&
    !p.grants[output.base.id]
  )
    throw denied();
  if (
    object(output.answerMessage) &&
    typeof output.answerMessage.id === "string"
  ) {
    const id = output.answerMessage.id;
    const message = visibleState(p, db, {
      method: "GET",
      path: "/api/conversations",
      body: {},
    })
      .conversations.flatMap((conversation) => conversation.messages)
      .find((message) => message.id === id);
    if (!message) throw missing();
    output.answerMessage = message;
  }
  return output;
}
