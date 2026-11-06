import { AppError } from "../http/errors.js";
import { assertRevision, advanceRevision } from "../services/consistency.js";
import { mutateRequest } from "../services/mutations.js";
import { requestBody } from "../http/validation.js";
import { Hono } from "hono";
import { createId } from "../lib/util.js";
import type { StateRepository } from "../repositories/state.js";
import { identifyAnswer } from "../services/answer.js";
import { search } from "../services/search.js";
import { traceView, messageView } from "../services/capabilities.js";
import { appendRequestAudit, auditView } from "../services/audit.js";
import type { AnswerKind, Settings } from "../types.js";

const departments = ["研发部", "人力资源部", "产品部", "财务部"];
const roles = ["知识库管理员", "内容编辑者", "普通成员"];
const resources = [
  "企业制度知识库",
  "技术文档知识库",
  "项目资料知识库",
  "常见问题知识库",
];

const sampleQuestions: Array<{
  question: string;
  expected: string;
  kind: AnswerKind;
}> = [
  {
    question: "公司的员工年假制度是什么？",
    expected: "员工休假管理制度.pdf",
    kind: "leave",
  },
  {
    question: "年假可以跨年使用吗？",
    expected: "员工休假管理制度.pdf",
    kind: "carry",
  },
  {
    question: "试用期员工有年假吗？",
    expected: "人力资源管理手册.docx",
    kind: "probation",
  },
  {
    question: "怎么申请年休假？",
    expected: "员工休假管理制度.pdf",
    kind: "apply",
  },
  {
    question: "报销流程和所需材料？",
    expected: "费用报销管理办法.pdf",
    kind: "expense",
  },
  {
    question: "新人入职需要准备什么？",
    expected: "人力资源管理手册.docx",
    kind: "onboarding",
  },
  {
    question: "项目文档的归档规范？",
    expected: "项目文档归档规范.pdf",
    kind: "archive",
  },
  {
    question: "如何接入知识库 API？",
    expected: "研发 API 接入指南.md",
    kind: "technical",
  },
];

export function governanceRoutes(store: StateRepository) {
  const app = new Hono();

  app.post("/retrieval/search", async (c) => {
    const body = requestBody(c);
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return c.json({ error: "查询内容不能为空" }, 400);
    const db = await store.load();
    const strategy =
      body.strategy === "BM25" || body.strategy === "向量检索"
        ? body.strategy
        : body.strategy === "混合检索"
          ? "混合检索"
          : undefined;
    const trace = search(db.documents, {
      query,
      strategy,
      scope: typeof body.scope === "string" ? body.scope : "全部知识库",
      threshold: typeof body.threshold === "number" ? body.threshold : 0.65,
      topK: typeof body.topK === "number" ? body.topK : 5,
    });
    if (db.settings.audit) {
      await mutateRequest(c, store, (database) => {
        const log = appendRequestAudit(database, c);
        log.status = trace.hits.length ? "已提交" : "未命中";
      });
    }
    return c.json({ trace: traceView(trace, !!c.get("principal")) });
  });

  app.get("/evaluations", async (c) => {
    const db = await store.load();
    return c.json({ evaluations: db.evaluations });
  });

  app.get("/evaluations/:id", async (c) => {
    const db = await store.load();
    const evaluation = db.evaluations.find((e) => e.id === c.req.param("id"));
    if (!evaluation) return c.json({ error: "评测任务不存在" }, 404);
    return c.json({ evaluation });
  });

  app.post("/evaluations", async (c) => {
    const body = requestBody(c);
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : `质量评测 ${new Date().toLocaleDateString("sv-SE")}`;
    const dataset =
      typeof body.dataset === "string" && body.dataset
        ? body.dataset
        : "内置评测集 v1（8 题）";
    const db = await store.load();
    const records = sampleQuestions.map((sample) => {
      const kind = identifyAnswer(sample.question, "全部知识库");
      const trace = search(db.documents, { query: sample.question, topK: 5 });
      const top = trace.hits[0];
      const score = top?.score ?? 0;
      const latency = trace.stages.reduce((sum, s) => sum + s.ms, 0);
      return {
        id: createId("rec"),
        question: sample.question,
        expected: sample.expected,
        kind,
        hit: kind !== "unknown" && score >= 0.65,
        score,
        latency,
      };
    });
    const hitRate = records.filter((r) => r.hit).length / records.length;
    const accuracy =
      records.filter((r) => r.hit && r.score >= 0.75).length / records.length;
    const coverage =
      records.filter((r) => r.kind !== "unknown").length / records.length;
    const avgLatency = Math.round(
      records.reduce((sum, r) => sum + r.latency, 0) / records.length,
    );
    const evaluation = {
      id: createId("eval"),
      name,
      dataset,
      status: "已完成" as const,
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      metrics: {
        hitRate: Number(hitRate.toFixed(2)),
        accuracy: Number(accuracy.toFixed(2)),
        latency: avgLatency,
        coverage: Number(coverage.toFixed(2)),
      },
      records,
    };
    const saved = await mutateRequest(c, store, (database) => {
      database.evaluations.unshift(evaluation);
      return evaluation;
    });
    return c.json({ evaluation: saved }, 201);
  });

  app.get("/permissions", async (c) => {
    const db = await store.load();
    return c.json({
      departments,
      roles,
      resources,
      members: db.members.map((member) => ({
        ...member,
        revision: member.revision ?? 1,
      })),
      revision: db.rulesRevision ?? 1,
      rules: db.rules,
    });
  });

  app.post("/permissions/members", async (c) => {
    const body = requestBody(c);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!name || !email.includes("@"))
      return c.json({ error: "请填写姓名和有效邮箱" }, 400);
    const member = {
      revision: 1,
      id: createId("member"),
      name,
      email,
      department:
        typeof body.department === "string" &&
        departments.includes(body.department)
          ? body.department
          : departments[0],
      role:
        typeof body.role === "string" && roles.includes(body.role)
          ? body.role
          : roles[2],
    };
    const saved = await mutateRequest(c, store, (db) => {
      if (
        db.members.some(
          (item) => item.email.toLowerCase() === member.email.toLowerCase(),
        )
      )
        throw new AppError(409, "DUPLICATE_EMAIL", "成员邮箱已存在");
      db.members.push(member);
      return member;
    });
    return c.json({ member: saved }, 201);
  });

  app.put("/permissions/members/:id", async (c) => {
    const body = requestBody(c);
    const updated = await mutateRequest(c, store, (db) => {
      const member = db.members.find((m) => m.id === c.req.param("id"));
      if (!member) return null;
      assertRevision(member, body.revision);
      if (
        typeof body.email === "string" &&
        db.members.some(
          (item) =>
            item.id !== member.id &&
            item.email.toLowerCase() === body.email?.toString().toLowerCase(),
        )
      )
        throw new AppError(409, "DUPLICATE_EMAIL", "成员邮箱已存在");
      if (
        member.role === "知识库管理员" &&
        body.role &&
        body.role !== member.role &&
        db.members.filter((item) => item.role === "知识库管理员").length <= 1
      )
        throw new AppError(409, "LAST_ADMIN", "不能移除最后一位管理员的角色");
      advanceRevision(member);
      if (typeof body.name === "string" && body.name.trim())
        member.name = body.name.trim();
      if (typeof body.email === "string" && body.email.includes("@"))
        member.email = body.email;
      if (
        typeof body.department === "string" &&
        departments.includes(body.department)
      )
        member.department = body.department;
      if (typeof body.role === "string" && roles.includes(body.role))
        member.role = body.role;
      return member;
    });
    if (updated === null) return c.json({ error: "成员不存在" }, 404);
    return c.json({ member: updated });
  });

  app.delete("/permissions/members/:id", async (c) => {
    const removed = await mutateRequest(c, store, (db) => {
      const index = db.members.findIndex((m) => m.id === c.req.param("id"));
      if (index === -1) return false;
      const member = db.members[index];
      if (
        member.role === "知识库管理员" &&
        db.members.filter((item) => item.role === "知识库管理员").length <= 1
      )
        throw new AppError(409, "LAST_ADMIN", "不能删除最后一位管理员");
      assertRevision(
        member,
        c.req.header("If-Match") ? Number(c.req.header("If-Match")) : undefined,
      );
      db.members.splice(index, 1);
      return true;
    });
    if (!removed) return c.json({ error: "成员不存在" }, 404);
    return c.json({ ok: true });
  });

  app.put("/permissions/rules", async (c) => {
    const body = requestBody(c);
    const key = typeof body.key === "string" ? body.key : "";
    const values = body.values;
    if (!key) return c.json({ error: "必须提供权限键 key" }, 400);
    if (
      !Array.isArray(values) ||
      values.length !== resources.length ||
      values.some((v) => typeof v !== "boolean")
    )
      return c.json(
        { error: `values 必须是长度为 ${resources.length} 的布尔数组` },
        400,
      );
    const saved = await mutateRequest(c, store, (db) => {
      assertRevision({ revision: db.rulesRevision ?? 1 }, body.revision);
      db.rules[key] = values as boolean[];
      db.rulesRevision = (db.rulesRevision ?? 1) + 1;
      return { key, values, revision: db.rulesRevision };
    });
    return c.json(saved);
  });

  app.get("/audit", async (c) => {
    const db = await store.load();
    const query = c.req.query("query")?.trim();
    const action = c.req.query("action");
    const logs = db.auditLogs
      .filter(
        (log) =>
          (!query ||
            log.content.includes(query) ||
            log.user.includes(query) ||
            log.id.includes(query) ||
            log.targetId?.includes(query) ||
            log.requestId?.includes(query) ||
            log.docs.some((d) => d.includes(query))) &&
          (!action || log.action === action),
      )
      .sort((a, b) => b.time.localeCompare(a.time));
    return c.json({ logs: logs.map(auditView) });
  });

  app.get("/audit/:id", async (c) => {
    const db = await store.load();
    const log = db.auditLogs.find((l) => l.id === c.req.param("id"));
    if (!log) return c.json({ error: "审计记录不存在" }, 404);
    const answer =
      log.conversationId && log.messageId
        ? db.conversations
            .find((conv) => conv.id === log.conversationId)
            ?.messages.find((message) => message.id === log.messageId)
        : undefined;

    return c.json({
      log: auditView(log),
      evidence: {
        chain: [
          { step: "操作记录", detail: log.content },
          {
            step: "关联消息",
            detail: answer
              ? `消息 ID：${answer.id}`
              : "旧记录未保存精确消息关联，无法重建证据",
          },
          { step: "授权记录", detail: "当前记录没有可核验的权限决策证据" },
        ],
        retrieval: answer
          ? messageView(answer, !!c.get("principal")).retrieval
          : undefined,
        sources: answer
          ? messageView(answer, !!c.get("principal")).sources
          : undefined,
      },
    });
  });

  app.get("/settings", async (c) => {
    const db = await store.load();
    return c.json({
      settings: { ...db.settings, revision: db.settings.revision ?? 1 },
    });
  });

  app.put("/settings", async (c) => {
    const body = requestBody(c);
    const current = (await store.load()).settings;
    if (body.tenant !== undefined && body.tenant !== current.tenant)
      throw new AppError(
        403,
        "TENANT_IMMUTABLE",
        "租户标识不能通过普通设置修改",
      );
    const workspace =
      typeof body.workspace === "string" && body.workspace.trim()
        ? body.workspace.trim()
        : current.workspace;
    const chunkSize =
      typeof body.chunkSize === "string" && body.chunkSize !== ""
        ? Number(body.chunkSize)
        : Number(current.chunkSize);
    const overlap =
      typeof body.overlap === "string" && body.overlap !== ""
        ? Number(body.overlap)
        : Number(current.overlap);
    const topK =
      typeof body.topK === "string" && body.topK !== ""
        ? Number(body.topK)
        : Number(current.topK);
    if (!Number.isFinite(chunkSize) || chunkSize < 64 || chunkSize > 4096)
      return c.json({ error: "分块长度应为 64–4096" }, 400);
    if (!Number.isFinite(overlap) || overlap < 0 || overlap >= chunkSize)
      return c.json({ error: "重叠长度应为 0 至分块长度之间" }, 400);
    if (!Number.isFinite(topK) || topK < 1 || topK > 20)
      return c.json({ error: "topK 应为 1–20" }, 400);
    const settings: Settings = {
      ...current,
      workspace,
      tenant:
        typeof body.tenant === "string" && body.tenant
          ? body.tenant
          : current.tenant,
      embedding:
        typeof body.embedding === "string" && body.embedding
          ? body.embedding
          : current.embedding,
      vector:
        typeof body.vector === "string" && body.vector
          ? body.vector
          : current.vector,
      chunkSize: String(chunkSize),
      overlap: String(overlap),
      strategy:
        typeof body.strategy === "string" && body.strategy
          ? body.strategy
          : current.strategy,
      topK: String(topK),
      rerank: typeof body.rerank === "boolean" ? body.rerank : current.rerank,
      citations:
        typeof body.citations === "boolean"
          ? body.citations
          : current.citations,
      multiTurn:
        typeof body.multiTurn === "boolean"
          ? body.multiTurn
          : current.multiTurn,
      audit: typeof body.audit === "boolean" ? body.audit : current.audit,
    };
    const saved = await mutateRequest(c, store, (db) => {
      assertRevision(db.settings, body.revision);
      settings.revision = (db.settings.revision ?? 1) + 1;
      db.settings = settings;
      return settings;
    });
    return c.json({ settings: saved });
  });

  app.get("/overview", async (c) => {
    const db = await store.load();
    const today = new Date().toISOString().slice(0, 10);
    return c.json({
      stats: {
        documents: db.documents.length,
        published: db.documents.filter((d) => d.status === "已发布").length,
        bases: db.bases.length,
        conversations: db.conversations.length,
        members: c.get("principal")?.visibleAccountCount ?? db.members.length,
        tasks: {
          running: db.tasks.filter((t) => t.status === "running").length,
          error: db.tasks.filter((t) => t.status === "error").length,
          done: db.tasks.filter((t) => t.status === "done").length,
        },
        queriesToday: db.auditLogs.filter(
          (log) =>
            (log.action === "知识问答" || log.action === "智能问答") &&
            log.outcome !== "failed" &&
            log.time.slice(0, 10) === today,
        ).length,
      },
      latestEvaluation: db.evaluations[0] ?? null,
    });
  });

  return app;
}
