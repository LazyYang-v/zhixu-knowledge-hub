import { Hono } from "hono";
import type { Store } from "../lib/store.js";
import { createId, timeGroup, timeOfDay } from "../lib/util.js";
import { answers, identifyAnswer, sourceFor } from "../services/answer.js";
import { search } from "../services/search.js";
import type { Conversation, Message } from "../types.js";

type ConversationSummary = Conversation & { time: string; group: string };

function serialize(conversation: Conversation): ConversationSummary {
  return {
    ...conversation,
    time: timeOfDay(new Date(conversation.updatedAt)),
    group: timeGroup(conversation.updatedAt),
  };
}

function readJson(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

export function conversationRoutes(store: Store) {
  const app = new Hono();

  app.get("/", async (c) => {
    const db = await store.load();
    const query = c.req.query("query")?.trim();
    const conversations = db.conversations
      .filter(
        (conv) =>
          !query ||
          conv.title.includes(query) ||
          conv.messages.some((m) => m.content.includes(query)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(serialize);
    return c.json({ conversations });
  });

  app.post("/", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const nowIso = new Date().toISOString();
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "新会话";
    const conversation: Conversation = {
      id: createId("conv"),
      title,
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [],
    };
    await store.update((db) => db.conversations.push(conversation));
    return c.json({ conversation: serialize(conversation) }, 201);
  });

  app.get("/:id", async (c) => {
    const db = await store.load();
    const conversation = db.conversations.find(
      (conv) => conv.id === c.req.param("id"),
    );
    if (!conversation) return c.json({ error: "会话不存在" }, 404);
    return c.json({ conversation: serialize(conversation) });
  });

  app.delete("/:id", async (c) => {
    const removed = await store.update((db) => {
      const index = db.conversations.findIndex(
        (conv) => conv.id === c.req.param("id"),
      );
      if (index === -1) return false;
      db.conversations.splice(index, 1);
      return true;
    });
    if (!removed) return c.json({ error: "会话不存在" }, 404);
    return c.json({ ok: true });
  });

  app.post("/:id/messages", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return c.json({ error: "消息内容不能为空" }, 400);
    const scope =
      typeof body.scope === "string" && body.scope ? body.scope : "全部知识库";
    const citationsOn = body.citations !== false;

    const settings = (await store.load()).settings;
    const result = await store.update((db) => {
      const conversation = db.conversations.find(
        (conv) => conv.id === c.req.param("id"),
      );
      if (!conversation) return null;
      const now = new Date();
      const nowIso = now.toISOString();
      const previous = [...conversation.messages]
        .reverse()
        .find((m) => m.role === "assistant")?.kind;
      const kind = identifyAnswer(content, scope, previous);
      const trace = search(db.documents, {
        query: content,
        scope,
        topK: Number(settings.topK) || 5,
        strategy: settings.rerank ? "混合检索" : "BM25",
      });
      const sources =
        citationsOn && kind !== "unknown"
          ? [sourceFor(kind), sourceFor(kind, true)]
          : [];
      const userMessage: Message = {
        id: createId("msg"),
        role: "user",
        content,
        time: timeOfDay(now),
      };
      const answerMessage: Message = {
        id: createId("msg"),
        role: "assistant",
        content: answers[kind],
        time: timeOfDay(now),
        kind,
        citations: citationsOn,
        sources,
        retrieval: trace,
        permission: {
          checked: ["租户隔离", "部门范围", "角色权限"],
          result: kind === "unknown" ? "通过（未命中知识）" : "通过",
        },
      };
      conversation.messages.push(userMessage, answerMessage);
      conversation.updatedAt = nowIso;
      if (
        conversation.title === "新会话" &&
        conversation.messages.filter((m) => m.role === "user").length === 1
      ) {
        conversation.title = content.slice(0, 30);
      }
      if (settings.audit) {
        db.auditLogs.push({
          id: createId("log"),
          time: nowIso,
          user: "王小雨",
          department: "人力资源部",
          action: "智能问答",
          content,
          source: "AI 知识助手",
          status: kind === "unknown" ? "未命中" : "正常",
          docs: sources.map((s) => s.title),
        });
      }
      return { conversation, userMessage, answerMessage };
    });
    if (!result) return c.json({ error: "会话不存在" }, 404);
    return c.json({
      userMessage: result.userMessage,
      answerMessage: result.answerMessage,
      conversation: serialize(result.conversation),
    });
  });

  app.patch("/:id/messages/:messageId/feedback", async (c) => {
    const body = readJson(await c.req.json().catch(() => null));
    const rating = body.rating;
    if (rating !== "up" && rating !== "down")
      return c.json({ error: "rating 必须是 up 或 down" }, 400);
    const updated = await store.update((db) => {
      const message = db.conversations
        .find((conv) => conv.id === c.req.param("id"))
        ?.messages.find((m) => m.id === c.req.param("messageId"));
      if (!message) return null;
      message.feedback = {
        rating,
        comment: typeof body.comment === "string" ? body.comment : undefined,
      };
      return message;
    });
    if (!updated) return c.json({ error: "消息不存在" }, 404);
    return c.json({ message: updated });
  });

  return app;
}
