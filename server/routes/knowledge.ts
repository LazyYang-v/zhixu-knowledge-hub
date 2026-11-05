import { Hono } from "hono";
import { createId } from "../lib/util.js";
import type { Store } from "../lib/store.js";
import type {
  KnowledgeBase,
  KnowledgeDocument,
  ProcessingTask,
} from "../types.js";

function readJson(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function nextVersion(versions: { version: string }[]): string {
  const latest = versions[0]?.version ?? "v0.0";
  const [, minor] = latest.split(".");
  return `v1.${Number(minor ?? 0) + 1}`;
}

function today(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function splitText(text: string, size = 200): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= size) {
      chunks.push(paragraph);
      continue;
    }
    for (let i = 0; i < paragraph.length; i += size) {
      chunks.push(paragraph.slice(i, i + size));
    }
  }
  return chunks.length > 0 ? chunks : [text];
}

export function knowledgeRoutes(store: Store) {
  const app = new Hono();

  app.get("/bases", async (c) => {
    const db = await store.load();
    return c.json({ bases: db.bases });
  });

  app.post("/bases", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "知识库名称不能为空" }, 400);
    const base: KnowledgeBase = {
      id: createId("kb"),
      name,
      description:
        typeof body.description === "string" ? body.description : "",
      color: typeof body.color === "string" ? body.color : "purple",
      owner: typeof body.owner === "string" ? body.owner : "运营部",
      access: typeof body.access === "string" ? body.access : "全体员工",
    };
    await store.update((db) => db.bases.push(base));
    return c.json({ base }, 201);
  });

  app.put("/bases/:id", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const updated = await store.update((db) => {
      const base = db.bases.find((b) => b.id === c.req.param("id"));
      if (!base) return null;
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
      return base;
    });
    if (!updated) return c.json({ error: "知识库不存在" }, 404);
    return c.json({ base: updated });
  });

  app.delete("/bases/:id", async (c) => {
    const removed = await store.update((db) => {
      const index = db.bases.findIndex((b) => b.id === c.req.param("id"));
      if (index === -1) return false;
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
    return c.json({ documents });
  });

  app.post("/documents/import", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const mode = body.mode;
    if (mode !== "file" && mode !== "web" && mode !== "text")
      return c.json({ error: "mode 必须是 file、web 或 text" }, 400);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.json({ error: "文档名称不能为空" }, 400);
    const source = typeof body.source === "string" ? body.source : undefined;
    if (mode === "web" && !source)
      return c.json({ error: "网页导入必须提供 source 地址" }, 400);
    const text = typeof body.text === "string" ? body.text : "";
    if (mode === "text" && !text.trim())
      return c.json({ error: "文本导入必须提供 text 内容" }, 400);

    const document = await store.update((db) => {
      const chunks = mode === "text" ? splitText(text) : [];
      const doc: KnowledgeDocument = {
        id: createId("doc"),
        name,
        category:
          typeof body.category === "string" && body.category
            ? body.category
            : "企业制度",
        status: "草稿",
        type:
          mode === "file"
            ? (name.split(".").pop() ?? "FILE").toUpperCase()
            : mode === "web"
              ? "网页"
              : "TEXT",
        size:
          typeof body.size === "string" && body.size
            ? body.size
            : mode === "text"
              ? `${Math.max(1, Math.ceil(text.length / 1024))} KB`
              : "—",
        owner: typeof body.owner === "string" ? body.owner : "王小雨",
        date: today(),
        chunks,
        versions: [
          { version: "v1.0", date: today(), note: "首次导入", chunks },
        ],
        department:
          typeof body.department === "string" ? body.department : "全体员工",
        level: typeof body.level === "string" ? body.level : "内部",
        strategy: "语义分块",
        stage: mode === "text" ? 4 : 1,
        task: mode === "text" ? "done" : "running",
        source,
      };
      db.documents.push(doc);
      db.tasks.push({
        id: createId("task"),
        docId: doc.id,
        docName: doc.name,
        status: doc.task,
        stage: doc.stage,
        updatedAt: new Date().toISOString(),
      });
      return doc;
    });
    return c.json({ document }, 201);
  });

  app.get("/documents/:id", async (c) => {
    const db = await store.load();
    const document = db.documents.find((doc) => doc.id === c.req.param("id"));
    if (!document) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document });
  });

  app.put("/documents/:id", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      if (typeof body.name === "string" && body.name.trim()) doc.name = body.name.trim();
      if (typeof body.category === "string") doc.category = body.category;
      if (typeof body.department === "string") doc.department = body.department;
      if (typeof body.level === "string") doc.level = body.level;
      if (typeof body.strategy === "string") doc.strategy = body.strategy;
      return doc;
    });
    if (!updated) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated });
  });

  app.delete("/documents/:id", async (c) => {
    const removed = await store.update((db) => {
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
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      doc.status = "已发布";
      db.auditLogs.push({
        id: createId("log"),
        time: new Date().toISOString(),
        user: doc.owner,
        department: "研发部",
        action: "文档发布",
        content: `发布《${doc.name}》`,
        source: "文档中心",
        status: "正常",
        docs: [doc.name],
      });
      return doc;
    });
    if (!updated) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated });
  });

  app.post("/documents/:id/archive", async (c) => {
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      doc.status = "已归档";
      return doc;
    });
    if (!updated) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated });
  });

  app.post("/documents/:id/advance", async (c) => {
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      if (doc.task === "error")
        return { error: "任务处于失败状态，请先重试" };
      doc.stage = Math.min(doc.stage + 1, 4);
      doc.task = doc.stage >= 4 ? "done" : "running";
      const task = db.tasks.find((t) => t.docId === doc.id && t.status !== "done");
      if (task) {
        task.stage = doc.stage;
        task.status = doc.task;
        task.updatedAt = new Date().toISOString();
      }
      return { doc };
    });
    if (updated === null) return c.json({ error: "文档不存在" }, 404);
    if ("error" in updated && updated.error)
      return c.json({ error: updated.error }, 409);
    return c.json({ document: updated.doc });
  });

  app.post("/documents/:id/retry", async (c) => {
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      doc.task = "running";
      doc.stage = Math.max(1, doc.stage);
      const task = db.tasks.find((t) => t.docId === doc.id);
      if (task) {
        task.status = "running";
        task.updatedAt = new Date().toISOString();
        delete task.error;
      }
      return { doc };
    });
    if (updated === null) return c.json({ error: "文档不存在" }, 404);
    return c.json({ document: updated.doc });
  });

  app.put("/documents/:id/chunks/:index", async (c) => {
    const index = Number(c.req.param("index"));
    const body = readJson(await c.req.json().catch(() => null));
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!Number.isInteger(index) || index < 0)
      return c.json({ error: "分块序号无效" }, 400);
    if (!content) return c.json({ error: "分块内容不能为空" }, 400);
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      if (!doc) return null;
      if (index >= doc.chunks.length) return null;
      doc.chunks[index] = content;
      const version = nextVersion(doc.versions);
      doc.versions.unshift({
        version,
        date: today(),
        note: `编辑分块 ${index + 1}`,
        chunks: [...doc.chunks],
      });
      return { doc, version };
    });
    if (updated === null) return c.json({ error: "文档或分块不存在" }, 404);
    return c.json({ document: updated.doc, version: updated.version });
  });

  app.post("/documents/:id/rollback", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const version = typeof body.version === "string" ? body.version : "";
    if (!version) return c.json({ error: "必须提供要回滚的版本号" }, 400);
    const updated = await store.update((db) => {
      const doc = db.documents.find((d) => d.id === c.req.param("id"));
      const target = doc?.versions.find((v) => v.version === version);
      if (!doc || !target) return null;
      const newVersion = nextVersion(doc.versions);
      doc.chunks = [...target.chunks];
      doc.versions.unshift({
        version: newVersion,
        date: today(),
        note: `回滚至 ${version}`,
        chunks: [...doc.chunks],
      });
      return { doc, newVersion };
    });
    if (updated === null) return c.json({ error: "文档或版本不存在" }, 404);
    return c.json({ document: updated.doc, version: updated.newVersion });
  });

  app.get("/tasks", async (c) => {
    const db = await store.load();
    return c.json({ tasks: db.tasks });
  });

  app.post("/tasks/:id/retry", async (c) => {
    const updated = await store.update((db): ProcessingTask | null => {
      const task = db.tasks.find((t) => t.id === c.req.param("id"));
      if (!task) return null;
      const doc = db.documents.find((d) => d.id === task.docId);
      if (doc) {
        doc.task = "running";
        doc.stage = Math.max(1, doc.stage);
      }
      task.status = "running";
      task.updatedAt = new Date().toISOString();
      delete task.error;
      return task;
    });
    if (updated === null) return c.json({ error: "任务不存在" }, 404);
    return c.json({ task: updated });
  });

  return app;
}
