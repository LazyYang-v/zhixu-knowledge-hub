import { advanceRevision, appendVersion } from "../services/consistency.js";
import { randomUUID } from "node:crypto";
import type { Db, KnowledgeDocument, ProcessingTask } from "../types.js";
import type { StateRepository } from "../repositories/state.js";
import { AppError } from "../http/errors.js";
import { createId } from "../lib/util.js";
import { validateChunks } from "../../shared/text-limits.js";
import { appendTaskAudit } from "../services/audit.js";
export type JobState =
  "queued" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";
export interface JobEvent {
  sequence: number;
  time: string;
  type: string;
  message: string;
}
export interface JobDetails {
  kind: "prepare_text" | "validate_chunks";
  state: JobState;
  version: string;
  inputText: string;
  inputChunks?: string[];
  chunkSize: number;
  overlap: number;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseToken?: string;
  leaseUntil?: string;
  checkpoint?: { stage: "parsed" | "chunked"; chunks?: string[] };
  events: JobEvent[];
}
export function event(
  task: ProcessingTask,
  type: string,
  message: string,
  now = new Date(),
) {
  if (!task.job) return;
  task.job.events.push({
    sequence: (task.job.events.at(-1)?.sequence ?? 0) + 1,
    time: now.toISOString(),
    type,
    message,
  });
  task.updatedAt = now.toISOString();
}
export function scheduleText(
  db: Db,
  doc: KnowledgeDocument,
  text: string,
  now = new Date(),
): ProcessingTask {
  return schedule(db, doc, { kind: "prepare_text", inputText: text }, now);
}
export function scheduleChunks(
  db: Db,
  doc: KnowledgeDocument,
  chunks: string[],
  now = new Date(),
): ProcessingTask {
  return schedule(
    db,
    doc,
    {
      kind: "validate_chunks",
      inputText: "",
      inputChunks: validateChunks(chunks),
    },
    now,
  );
}
function schedule(
  db: Db,
  doc: KnowledgeDocument,
  input: Pick<JobDetails, "kind" | "inputText" | "inputChunks">,
  now: Date,
): ProcessingTask {
  const version = doc.versions[0]?.version;
  if (!version)
    throw new AppError(409, "VERSION_MISSING", "文档没有可处理的版本");
  const existing = db.tasks.find(
    (task) =>
      task.docId === doc.id &&
      task.job?.version === version &&
      ["queued", "running", "retry_wait"].includes(task.job.state),
  );
  if (existing) return existing;
  const task: ProcessingTask = {
    id: createId("task"),
    docId: doc.id,
    docName: doc.name,
    status: "running",
    stage: 0,
    updatedAt: now.toISOString(),
    job: {
      ...input,
      state: "queued",
      version,
      chunkSize: Number(db.settings.chunkSize),
      overlap: Number(db.settings.overlap),
      attempts: 0,
      maxAttempts: 3,
      availableAt: now.toISOString(),
      events: [],
    },
  };
  doc.task = "running";
  doc.stage = 0;
  event(task, "queued", "已持久化文本处理任务；本任务不生成向量索引", now);
  db.tasks.push(task);
  return task;
}
export class JobQueue {
  constructor(
    private readonly repository: StateRepository,
    private readonly leaseMs = 30_000,
  ) {}
  async claim(now = new Date()) {
    const snapshot = await this.repository.load();
    if (
      !snapshot.tasks.some(
        (task) =>
          task.job &&
          ((["queued", "retry_wait"].includes(task.job.state) &&
            Date.parse(task.job.availableAt) <= now.getTime()) ||
            (task.job.state === "running" &&
              !!task.job.leaseUntil &&
              Date.parse(task.job.leaseUntil) <= now.getTime())),
      )
    )
      return null;
    return this.repository.update((db) => {
      for (const task of db.tasks) {
        const job = task.job;
        if (!job || ["succeeded", "failed", "cancelled"].includes(job.state))
          continue;
        const expired =
          job.state === "running" &&
          !!job.leaseUntil &&
          Date.parse(job.leaseUntil) <= now.getTime();
        if (
          (job.state === "running" && !expired) ||
          Date.parse(job.availableAt) > now.getTime()
        )
          continue;
        const doc = db.documents.find((doc) => doc.id === task.docId);
        if (!doc || doc.versions[0]?.version !== job.version) {
          job.state = "cancelled";
          task.status = "error";
          event(task, "cancelled", "文档已删除或版本改变，停止旧任务", now);
          continue;
        }
        if (job.attempts >= job.maxAttempts) {
          job.state = "failed";
          task.status = "error";
          task.error = "任务已超过最大尝试次数";
          event(task, "failed", task.error, now);
          doc.task = "error";
          appendTaskAudit(db, task);
          continue;
        }
        job.state = "running";
        job.attempts++;
        job.leaseToken = randomUUID();
        job.leaseUntil = new Date(now.getTime() + this.leaseMs).toISOString();
        event(
          task,
          expired ? "recovered" : "started",
          expired ? "租约过期，恢复未完成阶段" : "开始处理保存的文本",
          now,
        );
        return structuredClone(task);
      }
      return null;
    });
  }
  private async change(
    id: string,
    token: string,
    change: (task: ProcessingTask, db: Db) => void,
    now = new Date(),
  ) {
    return this.repository.update((db) => {
      const task = db.tasks.find((task) => task.id === id);
      if (
        !task?.job ||
        task.job.state !== "running" ||
        task.job.leaseToken !== token ||
        Date.parse(task.job.leaseUntil ?? "") <= now.getTime()
      )
        return false;
      change(task, db);
      task.job.leaseUntil = new Date(
        now.getTime() + this.leaseMs,
      ).toISOString();
      return true;
    });
  }
  async heartbeat(id: string, token: string, now = new Date()) {
    return this.change(id, token, () => {}, now);
  }
  async checkpoint(
    id: string,
    token: string,
    value: NonNullable<JobDetails["checkpoint"]>,
    now = new Date(),
  ) {
    return this.change(
      id,
      token,
      (task) => {
        task.job!.checkpoint = value;
        task.stage = value.stage === "parsed" ? 1 : 2;
        event(
          task,
          "checkpoint",
          value.stage === "parsed"
            ? "文本已校验"
            : task.job!.kind === "validate_chunks"
              ? "编辑分块校验完成，保留原有边界"
              : "固定长度分块已保存",
          now,
        );
      },
      now,
    );
  }
  async complete(
    id: string,
    token: string,
    chunks: string[],
    now = new Date(),
  ) {
    return this.change(
      id,
      token,
      (task, db) => {
        const doc = db.documents.find((doc) => doc.id === task.docId);
        if (!doc || doc.versions[0]?.version !== task.job!.version) {
          task.job!.state = "cancelled";
          task.status = "error";
          event(task, "cancelled", "版本改变，未提交旧结果", now);
          return;
        }
        doc.chunks = [...chunks];
        doc.versions[0].chunks = [...chunks];
        doc.versions[0].chunkIds = chunks.map(() => randomUUID());
        advanceRevision(doc);
        doc.task = "done";
        doc.stage = 3;
        task.job!.state = "succeeded";
        task.status = "done";
        task.stage = 3;
        delete task.error;
        event(
          task,
          "succeeded",
          "保存文本处理完成；向量化与真实索引尚未接入",
          now,
        );
        appendTaskAudit(db, task);
      },
      now,
    );
  }
  async fail(
    id: string,
    token: string,
    code: string,
    retryable: boolean,
    now = new Date(),
  ) {
    return this.change(
      id,
      token,
      (task, db) => {
        const retry = retryable && task.job!.attempts < task.job!.maxAttempts;
        task.job!.state = retry ? "retry_wait" : "failed";
        task.job!.availableAt = new Date(
          now.getTime() + 1000 * 2 ** task.job!.attempts,
        ).toISOString();
        task.status = retry ? "running" : "error";
        task.error = code;
        const doc = db.documents.find((doc) => doc.id === task.docId);
        if (doc && doc.versions[0]?.version === task.job!.version)
          doc.task = task.status;
        event(task, retry ? "retry_scheduled" : "failed", code, now);
        if (!retry) appendTaskAudit(db, task);
      },
      now,
    );
  }
}
export function retryTask(db: Db, task: ProcessingTask, now = new Date()) {
  if (task.job && !["failed", "cancelled"].includes(task.job.state))
    throw new AppError(
      409,
      "TASK_NOT_RETRYABLE",
      "当前任务不处于可重试的失败状态",
    );
  const doc = db.documents.find((doc) => doc.id === task.docId);
  if (!doc) throw new AppError(404, "NOT_FOUND", "文档不存在");
  if (!task.job) {
    const text = doc.chunks.join("\n\n");
    if (!text.trim())
      throw new AppError(
        409,
        "SOURCE_UNAVAILABLE",
        "没有可处理的文本；请上传原文件或粘贴文本",
      );
    appendVersion(doc, [...doc.chunks], "重新处理历史保存文本");
    advanceRevision(doc);
    const next = scheduleChunks(db, doc, doc.chunks, now);
    task.supersededBy = next.id;
    return next;
  }
  if (task.job.version !== doc.versions[0]?.version)
    throw new AppError(409, "VERSION_CONFLICT", "请对当前文档版本创建新任务");
  task.job.state = "queued";
  task.job.attempts = 0;
  task.job.availableAt = now.toISOString();
  delete task.job.leaseToken;
  delete task.job.leaseUntil;
  task.status = "running";
  delete task.error;
  doc.task = "running";
  event(task, "manual_retry", "用户重新提交失败任务", now);
  return task;
}
export function cancelTask(db: Db, task: ProcessingTask, now = new Date()) {
  if (
    !task.job ||
    !["queued", "running", "retry_wait"].includes(task.job.state)
  )
    throw new AppError(409, "TASK_NOT_CANCELLABLE", "该任务当前不能取消");
  task.job.state = "cancelled";
  task.status = "error";
  task.error = "用户取消任务";
  delete task.job.leaseToken;
  delete task.job.leaseUntil;
  const doc = db.documents.find((doc) => doc.id === task.docId);
  if (doc && doc.versions[0]?.version === task.job.version) doc.task = "error";
  event(task, "cancelled", "用户取消任务，过期执行结果不会提交", now);
  return task;
}
