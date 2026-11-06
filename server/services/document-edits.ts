import type { Db, KnowledgeDocument } from "../types.js";
import {
  assertRevision,
  advanceRevision,
  appendVersion,
} from "./consistency.js";
import { scheduleChunks } from "../jobs/queue.js";
import { validateChunks } from "../../shared/text-limits.js";
import { AppError } from "../http/errors.js";

/** One version and one durable validation job, committed with the caller's repository mutation. */
export function editChunks(
  db: Db,
  doc: KnowledgeDocument,
  revision: unknown,
  chunks: string[],
  note: string,
) {
  assertRevision(doc, revision);
  try {
    validateChunks(chunks);
  } catch {
    throw new AppError(
      400,
      "INVALID_CHUNKS",
      "分块为空或超过保存数量/长度限制，未修改文档",
    );
  }
  advanceRevision(doc);
  const version = appendVersion(doc, chunks, note).version;
  scheduleChunks(db, doc, chunks);
  return { doc, version };
}
