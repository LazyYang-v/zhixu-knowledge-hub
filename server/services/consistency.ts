import type { KnowledgeBase, KnowledgeDocument } from "../types.js";
import { AppError } from "../http/errors.js";
export const publicationFields = [
  "name",
  "type",
  "size",
  "owner",
  "date",
  "department",
  "level",
  "strategy",
  "source",
] as const;
export function publicationMetadata(
  doc: KnowledgeDocument,
): Record<string, string> {
  return Object.fromEntries(
    publicationFields.flatMap((key) =>
      typeof doc[key] === "string" ? [[key, doc[key]]] : [],
    ),
  );
}
export function assertRevision(
  entity: { revision?: number },
  expected: unknown,
) {
  if (expected === undefined)
    throw new AppError(
      409,
      "REVISION_REQUIRED",
      "请先刷新记录，再提交带版本号的修改",
    );
  if (expected !== (entity.revision ?? 1))
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      "记录已被修改，请刷新后比较并重新提交",
    );
}
export function advanceRevision<T extends { revision?: number }>(entity: T): T {
  entity.revision = (entity.revision ?? 1) + 1;
  return entity;
}
export function baseForDocument(
  doc: KnowledgeDocument,
  bases: KnowledgeBase[],
) {
  return bases.find((base) =>
    doc.baseId ? base.id === doc.baseId : base.name === doc.category,
  );
}
export function documentDto(doc: KnowledgeDocument, bases: KnowledgeBase[]) {
  return {
    ...doc,
    versions: doc.versions.map((version) => versionDto(doc.id, version)),
    baseId: baseForDocument(doc, bases)?.id,
    revision: doc.revision ?? 1,
  };
}
export function nextVersion(versions: { version: string }[]) {
  const parsed = versions
    .map((item) => /^v(\d+)\.(\d+)$/.exec(item.version))
    .filter((item): item is RegExpExecArray => item !== null)
    .map((item) => [Number(item[1]), Number(item[2])])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const [major, minor] = parsed[0] ?? [1, -1];
  return `v${major}.${minor + 1}`;
}
export function versionDto(
  docId: string,
  version: import("../types.js").DocumentVersion,
) {
  const id = version.id ?? `legacy:${docId}:${version.version}`;
  return {
    ...version,
    id,
    chunkIds:
      version.chunkIds ??
      version.chunks.map((_, index) => `${id}:chunk:${index}`),
  };
}
export function appendVersion(
  doc: KnowledgeDocument,
  chunks: string[],
  note: string,
) {
  const id = crypto.randomUUID();
  const result = {
    sourceArtifactId: doc.sourceArtifactId,
    id,
    version: nextVersion(doc.versions),
    date: new Date().toISOString().slice(0, 10),
    note,
    chunks: [...chunks],
    chunkIds: chunks.map(() => crypto.randomUUID()),
  };
  doc.chunks = [...chunks];
  doc.versions.unshift(result);
  return result;
}
