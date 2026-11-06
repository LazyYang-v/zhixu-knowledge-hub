import { mutateRequest } from "../services/mutations.js";
import { taskDto } from "../jobs/views.js";
import { scheduleText, retryTask, cancelTask } from "../jobs/queue.js";
import {
  assertRevision,
  advanceRevision,
  baseForDocument,
  documentDto,
  nextVersion,
  appendVersion,
  versionDto,
  publicationMetadata,
} from "../services/consistency.js";
import { AppError } from "../http/errors.js";
import { requestBody } from "../http/validation.js";
import { editChunks } from "../services/document-edits.js";
import { Hono } from "hono";
import { createId } from "../lib/util.js";
import { FileStore, textFile, type FileArtifact } from "../services/files.js";
import type { StateRepository } from "../repositories/state.js";
import type {
  KnowledgeBase,
  KnowledgeDocument,
  ProcessingTask,
} from "../types.js";

function today(): string {
  return new Date().toLocaleDateString("sv-SE");
}

export function knowledgeRoutes(store: StateRepository, files: FileStore) {
  const app = new Hono();

  app.get("/bases", async (c) => {
    const db = await store.load();
    return c.json({
      bases: db.bases.map((base) => ({
        ...base,
        revision: base.revision ?? 1,
      })),
    });
  });

  app.post("/bases", async (c) => {
    const body = requestBody(c);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "知识库名称不能为空" }, 400);
    const base: KnowledgeBase = {
      revision: 1,
      id: createId("kb"),
      name,
      description: typeof body.description === "string" ? body.description : "",
      color: typeof body.color === "string" ? body.color : "purple",
      owner: typeof body.owner === "string" ? body.owner : "运营部",
      access: typeof body.access === "string" ? body.access : "全体员工",
    };
    const savedBase = await mutateRequest(c, store, (db) => {
      if (
        db.bases.some(
          (item) =>
            item.name.normalize("NFKC").toLowerCase() ===
            base.name.normalize("NFKC").toLowerCase(),
        )
      )
        throw new AppError(409, "DUPLICATE_NAME", "知识库名称已存在");
      db.bases.push(base);
      return base;
    });
    return c.json({ base: savedBase }, 201);
  });

  app.put("/bases/:id", async (c) => {
    const body = requestBody(c);
    const updated = await mutateRequest(c, store, (db) => {
      const base = db.bases.find((b) => b.id === c.req.param("id"));
      if (!base) return null;
      assertRevision(base, body.revision);
      const oldName = base.name;
      if (
        typeof body.name === "string" &&
        db.bases.some(
          (item) =>
            item.id !== base.id &&
            item.name.normalize("NFKC").toLowerCase() ===
              body.name?.toString().normalize("NFKC").toLowerCase(),
        )
      )
        throw new AppError(409, "DUPLICATE_NAME", "知识库名称已存在");
      Object.assign(base, {
        name:
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim()
            : base.name,
        description:
          typeof body.description === "string"
            ? body.description
            : base.description,
        color: typeof body.color === "string" ? body.color : base.color,
        owner: typeof body.owner === "string" ? body.owner : base.owner,
        access: typeof body.access === "string" ? body.access : base.access,
      });
      advanceRevision(base);
      for (const doc of db.documents) {
        if (
          doc.baseId === base.id ||
          (!doc.baseId && doc.category === oldName)
        ) {
          doc.baseId = base.id;
          doc.category = base.name;
          advanceRevision(doc);
        }
      }
      return base;
    });
    if (!updated) return c.json({ error: "知识库不存在" }, 404);
    return c.json({ base: updated });
  });

  app.delete("/bases/:id", async (c) => {
    const removed = await mutateRequest(c, store, (db) => {
      const index = db.bases.findIndex((b) => b.id === c.req.param("id"));
      if (index === -1) return false;
      if (
        db.documents.some(
          (doc) => baseForDocument(doc, db.bases)?.id === db.bases[index].id,
        )
      )
        throw new AppError(
          409,
          "RESOURCE_NOT_EMPTY",
          "知识库仍有关联文档，请先处理这些文档",
        );
      db.bases.splice(index, 1);
      return true;
    });
    if (!removed) return c.json({ error: "知识库不存在" }, 404);
    return c.json({ ok: true });
  });

  app.get("/documents", async (c) => {
    const db = await store.load();
    const query = c.req.query("query")?.trim();
    const status = c.req.query("status");
    const category = c.req.query("category");
    const documents = db.documents.filter(
      (doc) =>
        (!query ||
          doc.name.includes(query) ||
          doc.chunks.some((chunk) => chunk.includes(query))) &&
        (!status || doc.status === status) &&
        (!category || doc.category === category),
    );
    return c.json({
      documents: documents.map((doc) => documentDto(doc, db.bases)),
    });
  });

  app.post("/documents/import", async (c) => {
    const body = requestBody(c);
    const mode = body.mode;
    if (mode !== "file" && mode !== "web" && mode !== "text")
      return c.json({ error: "mode 必须是 file、web 或 text" }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "文档名称不能为空" }, 400);
    const source = typeof body.source === "string" ? body.source : undefined;
    if (mode === "web" && !source)
      return c.json({ error: "网页导入必须提供 source 地址" }, 400);
    let text = typeof body.text === "string" ? body.text : "";
    if (mode === "text" && !text.trim())
      return c.json({ error: "文本导入必须提供 text 内容" }, 400);

    let artifact: FileArtifact | undefined;
    let hasText = text.trim().length > 0;

    const document = await mutateRequest(
      c,
      store,
      (db) => {
        const base = db.bases.find((item) =>
          typeof body.baseId === "string"
            ? item.id === body.baseId
            : item.name === (body.category ?? "企业制度"),
        );
        if (!base)
          throw new AppError(
            400,
            "UNKNOWN_KNOWLEDGE_BASE",
            "请选择有效的知识库",
          );
        const chunks: string[] = [];
        const doc: KnowledgeDocument = {
          sourceArtifactId: artifact?.id,
          revision: 1,
          baseId: base.id,
          id: createId("doc"),
          name,
          category: base.name,
          status: "草稿",
          type:
            mode === "file"
              ? (artifact!.name.split(".").pop() ?? "FILE").toUpperCase()
              : mode === "web"
                ? "网页"
                : "TEXT",
          size: artifact
            ? `${Math.max(1, Math.ceil(artifact.size / 1024))} KB`
            : typeof body.size === "string" && body.size
              ? body.size
              : mode === "text"
                ? `${Math.max(1, Math.ceil(text.length / 1024))} KB`
                : "—",
          owner: typeof body.owner === "string" ? body.owner : "王小雨",
          date: today(),
          chunks,
          versions: [
            {
              sourceArtifactId: artifact?.id,
              version: "v1.0",
              date: today(),
              note: "首次导入",
              chunks,
            },
          ],
          department:
            typeof body.department === "string" ? body.department : "全体员工",
          level: typeof body.level === "string" ? body.level : "内部",
          strategy: hasText ? "固定长度" : "未解析",
          stage: 0,
          task: hasText ? "running" : "error",
          source,
        };
        db.documents.push(doc);
        if (hasText) scheduleText(db, doc, text);
        else
          db.tasks.push({
            id: createId("task"),
            docId: doc.id,
            docName: doc.name,
            status: doc.task,
            stage: doc.stage,
            updatedAt: new Date().toISOString(),
            error:
              mode === "file"
                ? "PARSER_UNAVAILABLE：原文件已保存，此格式解析器尚未接入"
                : "FETCHER_UNAVAILABLE：网页链接已保存，抓取器尚未接入",
          });
        return doc;
      },
      async () => {
        artifact =
          mode === "file"
            ? (await store.load()).files?.[String(body.artifactId)]
            : undefined;
        if (mode === "file" && !artifact)
          throw new AppError(400, "UNKNOWN_FILE", "请先上传原文件，再创建文档");
        if (artifact) {
          const bytes = await files.read(artifact);
          if (
            artifact.mediaType === "text/plain" ||
            artifact.mediaType === "text/markdown"
          )
            text = textFile(bytes);
        }
        hasText = text.trim().length > 0;
      },
    );
    return c.json({ document }, 201);
  });

  app.get("/documents/:id", async (c) => {
    const db = await store.load();
    const document = db.documents.find((doc) => doc.id === c.req.param("id"));
    if (!document) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: documentDto(document, db.bases) });
  });

  app.put("/documents/:id", async (c) => {
    const body = requestBody(c);
    const updated = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      assertRevision(doc, body.revision);
      if (
        typeof body.baseId === "string" ||
        typeof body.category === "string"
      ) {
        const base = db.bases.find((base) =>
          typeof body.baseId === "string"
            ? base.id === body.baseId
            : base.name === body.category,
        );
        if (!base)
          throw new AppError(
            400,
            "UNKNOWN_KNOWLEDGE_BASE",
            "请选择有效的知识库",
          );
        doc.baseId = base.id;
        doc.category = base.name;
      }
      advanceRevision(doc);
      if (typeof body.name === "string" && body.name.trim())
        doc.name = body.name.trim();

      if (typeof body.department === "string") doc.department = body.department;
      if (typeof body.level === "string") doc.level = body.level;
      if (typeof body.strategy === "string") doc.strategy = body.strategy;
      return doc;
    });
    if (!updated) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated });
  });

  app.delete("/documents/:id", async (c) => {
    const removed = await mutateRequest(c, store, (db) => {
      const index = db.documents.findIndex((d) => d.id === c.req.param("id"));
      if (index === -1) return false;
      db.documents.splice(index, 1);
      db.tasks = db.tasks.filter((t) => t.docId !== c.req.param("id"));
      return true;
    });
    if (!removed) return c.json({ error: "文档不存在" }, 404);
    return c.json({ ok: true });
  });

  app.post("/documents/:id/publish", async (c) => {
    const body = requestBody(c);
    const updated = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      assertRevision(doc, body.revision);
      if (doc.task !== "done" || doc.chunks.length === 0)
        throw new AppError(
          409,
          "DOCUMENT_NOT_READY",
          "文档尚未完成文本处理，不能发布",
        );
      advanceRevision(doc);
      doc.status = "已发布";
      doc.publishedVersionId = versionDto(doc.id, doc.versions[0]).id;
      doc.publishedMetadata = publicationMetadata(doc);
      return doc;
    });
    if (!updated) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated });
  });

  app.post("/documents/:id/archive", async (c) => {
    const body = requestBody(c);
    const updated = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      assertRevision(doc, body.revision);
      advanceRevision(doc);
      doc.status = "已归档";
      return doc;
    });
    if (!updated) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated });
  });

  app.post("/documents/:id/advance", () => {
    throw new AppError(
      409,
      "MANUAL_ADVANCE_DISABLED",
      "任务阶段由后台处理器提交，不能由页面推进",
    );
  });

  app.post("/documents/:id/retry", async (c) => {
    const result = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((doc) => doc.id === c.req.param("id"));
      if (!doc) throw new AppError(404, "NOT_FOUND", "文档不存在");
      const task = db.tasks
        .slice()
        .reverse()
        .find((task) => task.docId === doc.id);
      if (!task)
        throw new AppError(409, "TASK_MISSING", "文档没有可重试的任务");
      retryTask(db, task);
      return doc;
    });
    return c.json({ document: result });
  });

  app.put("/documents/:id/chunks", async (c) => {
    const body = requestBody(c);
    const chunks = body.chunks as string[];
    const updated = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((item) => item.id === c.req.param("id"));
      if (!doc) throw new AppError(404, "NOT_FOUND", "文档不存在");
      assertRevision(doc, body.revision);
      if (chunks.length !== doc.chunks.length)
        throw new AppError(
          409,
          "CHUNK_LAYOUT_CHANGED",
          "分块数量已改变，请刷新并比较后重试",
        );
      if (chunks.every((chunk, index) => chunk === doc.chunks[index]))
        return { doc, version: doc.versions[0].version };
      return editChunks(db, doc, body.revision, chunks, "批量编辑分块");
    });
    return c.json({ document: updated.doc, version: updated.version });
  });

  app.put("/documents/:id/chunks/:index", async (c) => {
    const index = Number(c.req.param("index"));
    const body = requestBody(c);
    const content = typeof body.content === "string" ? body.content : "";
    if (!Number.isInteger(index) || index < 0)
      return c.json({ error: "分块序号无效" }, 400);
    if (!content) return c.json({ error: "分块内容不能为空" }, 400);
    const updated = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      if (index >= doc.chunks.length) return null;
      const chunks = [...doc.chunks];
      chunks[index] = content;
      return editChunks(
        db,
        doc,
        body.revision,
        chunks,
        `编辑分块 ${index + 1}`,
      );
    });
    if (updated === null) return c.json({ error: "文档或分块不存在" }, 404);
    return c.json({ document: updated.doc, version: updated.version });
  });

  app.post("/documents/:id/rollback", async (c) => {
    const body = requestBody(c);
    const version = typeof body.version === "string" ? body.version : "";
    if (!version) return c.json({ error: "必须提供要回滚的版本号" }, 400);
    const updated = await mutateRequest(c, store, (db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      const target = doc?.versions.find((v) => v.version === version);
      if (!doc || !target) return null;
      return editChunks(
        db,
        doc,
        body.revision,
        [...target.chunks],
        `回滚至 ${version}`,
      );
    });
    if (updated === null) return c.json({ error: "文档或版本不存在" }, 404);
    return c.json({ document: updated.doc, version: updated.version });
  });

  app.get("/tasks", async (c) => {
    const db = await store.load();
    return c.json({ tasks: db.tasks.map(taskDto) });
  });

  app.post("/tasks/:id/retry", async (c) => {
    const task = await mutateRequest(c, store, (db) => {
      const task = db.tasks.find((task) => task.id === c.req.param("id"));
      if (!task) throw new AppError(404, "NOT_FOUND", "任务不存在");
      return retryTask(db, task);
    });
    return c.json({ task: taskDto(task) });
  });
  app.post("/tasks/:id/cancel", async (c) => {
    const task = await mutateRequest(c, store, (db) => {
      const task = db.tasks.find((task) => task.id === c.req.param("id"));
      if (!task) throw new AppError(404, "NOT_FOUND", "任务不存在");
      return cancelTask(db, task);
    });
    return c.json({ task: taskDto(task) });
  });
  app.get("/tasks/:id/events", async (c) => {
    const task = (await store.load()).tasks.find(
      (task) => task.id === c.req.param("id"),
    );
    if (!task) throw new AppError(404, "NOT_FOUND", "任务不存在");
    const after = Number(c.req.query("after") ?? 0);
    if (!Number.isInteger(after) || after < 0)
      throw new AppError(400, "VALIDATION_ERROR", "after 必须是非负整数");
    return c.json({
      events: (task.job?.events ?? []).filter(
        (event) => event.sequence > after,
      ),
      state: task.job?.state ?? "legacy",
    });
  });

  return app;
}
