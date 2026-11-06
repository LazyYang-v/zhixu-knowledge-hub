import type { StateRepository } from "../repositories/state.js";
import { JobQueue } from "./queue.js";
import {
  MAX_CHUNKS,
  MAX_TOTAL_CHUNK_CHARACTERS,
  validateChunks,
} from "../../shared/text-limits.js";
export function chunkText(text: string, size: number, overlap: number) {
  if (!text.trim()) throw new Error("EMPTY_TEXT");
  if (
    !Number.isInteger(size) ||
    size < 64 ||
    size > 4096 ||
    !Number.isInteger(overlap) ||
    overlap < 0 ||
    overlap >= size
  )
    throw new Error("INVALID_CHUNK_CONFIG");
  const points = Array.from(text.replace(/\r\n?/g, "\n"));
  const count = Math.max(
    1,
    Math.ceil((points.length - size) / (size - overlap)) + 1,
  );
  if (
    count > MAX_CHUNKS ||
    count * Math.min(size, points.length) * 2 > MAX_TOTAL_CHUNK_CHARACTERS
  )
    throw new Error("CHUNK_EXPANSION_LIMIT");
  const chunks: string[] = [];
  for (let offset = 0; offset < points.length; offset += size - overlap) {
    const chunk = points
      .slice(offset, offset + size)
      .join("")
      .trim();
    if (chunk) chunks.push(chunk);
    if (offset + size >= points.length) break;
  }
  return chunks;
}
export async function runOne(queue: JobQueue) {
  const task = await queue.claim();
  if (!task?.job?.leaseToken) return false;
  const token = task.job.leaseToken;
  try {
    if (task.job.kind === "prepare_text" && !task.job.inputText.trim())
      throw new Error("EMPTY_TEXT");
    if (
      !task.job.checkpoint &&
      !(await queue.checkpoint(task.id, token, { stage: "parsed" }))
    )
      return true;
    const chunks =
      task.job.checkpoint?.stage === "chunked"
        ? (task.job.checkpoint.chunks ?? [])
        : task.job.kind === "validate_chunks"
          ? validateChunks(task.job.inputChunks ?? [])
          : chunkText(task.job.inputText, task.job.chunkSize, task.job.overlap);
    if (!(await queue.checkpoint(task.id, token, { stage: "chunked", chunks })))
      return true;
    await queue.complete(task.id, token, chunks);
  } catch (error) {
    await queue.fail(
      task.id,
      token,
      error instanceof Error ? error.message : "TEXT_PROCESSING_FAILED",
      false,
    );
  }
  return true;
}
/** JSON mode shares the API's repository in this process; it must not start a second writer process. */
export function startWorker(repository: StateRepository, interval = 1000) {
  const queue = new JobQueue(repository);
  let stopping = false;
  let active: Promise<unknown> | null = null;
  const timer = setInterval(() => {
    if (!active && !stopping) {
      active = runOne(queue)
        .catch((error) =>
          console.error(
            JSON.stringify({
              code: "WORKER_FAILED",
              name: error instanceof Error ? error.name : "Unknown",
            }),
          ),
        )
        .finally(() => {
          active = null;
        });
    }
  }, interval);
  timer.unref();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await active;
  };
}
