import { apiFetch } from "../../lib/api";
import type { Conversation, Message } from "../../lib/chat-data";
import { answers, identifyAnswer } from "../../lib/chat-data";
export interface SendOptions {
  question: string;
  scope: string;
  citations: boolean;
  multiTurn: boolean;
}
export async function sendMessageFlow(
  options: SendOptions & {
    conversations: Conversation[];
    activeId: string;
    ensureConversation: () => Promise<string>;
  },
) {
  const id = options.activeId || (await options.ensureConversation());
  const data = await apiFetch<{
    userMessage: Message;
    answerMessage: Message;
    conversation: Conversation;
  }>(`/api/conversations/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: options.question,
      scope: options.scope,
      citations: options.citations,
      multiTurn: options.multiTurn,
    }),
  });
  if (data)
    return {
      conversationId: id,
      conversation: data.conversation,
      mode: "server" as const,
    };
  const current = options.conversations.find((conv) => conv.id === id);
  const previous = current?.messages
    .slice()
    .reverse()
    .find((m) => m.role === "assistant")?.kind;
  const kind = identifyAnswer(
    options.question,
    options.scope,
    options.multiTurn ? previous : undefined,
  );
  const conversation: Conversation = {
    ...(current ?? {
      id,
      title: options.question,
      time: new Date().toLocaleTimeString(),
      group: "今天",
      messages: [],
    }),
    title:
      current?.title === "新会话"
        ? options.question
        : (current?.title ?? options.question),
    messages: [
      ...(current?.messages ?? []),
      { id: crypto.randomUUID(), role: "user", content: options.question },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        kind,
        content: answers[kind],
        citations: options.citations,
      },
    ],
  };
  return { conversationId: id, conversation, mode: "demo" as const };
}
