import { mutateRequest } from "../services/mutations.js";
import { requestBody } from "../http/validation.js";
import { Hono } from "hono";
import type { StateRepository } from "../repositories/state.js";
import { createId, timeGroup, timeOfDay } from "../lib/util.js";
import { answers, identifyAnswer, sourceFor } from "../services/answer.js";
import { search } from "../services/search.js";
import {
  messageView,
  unconfiguredPermission,
} from "../services/capabilities.js";
import type { Conversation, Message } from "../types.js";

type ConversationSummary = Conversation & { time: string; group: string };

function serialize(
  conversation: Conversation,
  authorized = false,
): ConversationSummary {
  return {
    ...conversation,
    messages: conversation.messages.map((message) =>
      messageView(message, authorized),
    ),
    time: timeOfDay(new Date(conversation.updatedAt)),
    group: timeGroup(conversation.updatedAt),
  };
}

export function conversationRoutes(store: StateRepository) {
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
      .map((conversation) => serialize(conversation, !!c.get("principal")));
    return c.json({ conversations });
  });

  app.post("/", async (c) => {
    const body = requestBody(c);
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
    const saved = await mutateRequest(c, store, (db) => {
      db.conversations.push(conversation);
      return conversation;
    });
    return c.json(
      { conversation: serialize(saved, !!c.get("principal")) },
      201,
    );
  });

  app.get("/:id", async (c) => {
    const db = await store.load();
    const conversation = db.conversations.find(
      (conv) => conv.id === c.req.param("id"),
    );
    if (!conversation) return c.json({ error: "会话不存在" }, 404);
    return c.json({
      conversation: serialize(conversation, !!c.get("principal")),
    });
  });

  app.delete("/:id", async (c) => {
    const removed = await mutateRequest(c, store, (db) => {
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
    const body = requestBody(c);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return c.json({ error: "消息内容不能为空" }, 400);
    const scope =
      typeof body.scope === "string" && body.scope ? body.scope : "全部知识库";
    const citationsOn = body.citations !== false;

    const settings = (await store.load()).settings;
    const result = await mutateRequest(c, store, (db) => {
      const conversation = db.conversations.find(
        (conv) => conv.id === c.req.param("id"),
      );
      if (!conversation) return null;
      const now = new Date();
      const nowIso = now.toISOString();
      const previous =
        (body.multiTurn ?? settings.multiTurn) === false
          ? undefined
          : [...conversation.messages]
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
        answerMode: "rule_demo",
        id: createId("msg"),
        role: "assistant",
        content: answers[kind],
        time: timeOfDay(now),
        kind,
        citations: citationsOn,
        sources,
        retrieval: trace,
        permission: unconfiguredPermission(),
      };
      conversation.messages.push(userMessage, answerMessage);
      conversation.updatedAt = nowIso;
      if (
        conversation.title === "新会话" &&
        conversation.messages.filter((m) => m.role === "user").length === 1
      ) {
        conversation.title = content.slice(0, 30);
      }
      return { conversation, userMessage, answerMessage };
    });
    if (!result) return c.json({ error: "会话不存在" }, 404);
    return c.json({
      userMessage: result.userMessage,
      answerMessage: messageView(result.answerMessage, !!c.get("principal")),
      conversation: serialize(result.conversation, !!c.get("principal")),
    });
  });

  app.patch("/:id/messages/:messageId/feedback", async (c) => {
    const body = requestBody(c);
    const rating = body.rating;
    if (rating !== "up" && rating !== "down" && rating !== null)
      return c.json({ error: "rating 必须是 up、down 或 null" }, 400);
    const updated = await mutateRequest(c, store, (db) => {
      const message = db.conversations
        .find((conv) => conv.id === c.req.param("id"))
        ?.messages.find((m) => m.id === c.req.param("messageId"));
      if (!message) return null;
      message.feedback =
        rating === null
          ? undefined
          : {
              rating,
              comment:
                typeof body.comment === "string" ? body.comment : undefined,
            };
      return message;
    });
    if (!updated) return c.json({ error: "消息不存在" }, 404);
    return c.json({ message: messageView(updated, !!c.get("principal")) });
  });

  return app;
}
