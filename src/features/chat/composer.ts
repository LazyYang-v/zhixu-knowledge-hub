import type { Conversation, Message } from "../../lib/chat-data";
import { answers, identifyAnswer } from "../../lib/chat-data";
import { apiFetch } from "../../lib/api";

const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export interface SendOptions {
  question: string;
  scope: string;
  citations: boolean;
  multiTurn: boolean;
}

export interface SendResult {
  conversationId: string;
  answer?: Message;
  mode: "server" | "offline";
}

export async function sendMessageFlow({
  question,
  scope,
  citations,
  multiTurn,
  conversations,
  activeId,
  ensureConversation,
}: SendOptions & {
  conversations: Conversation[];
  activeId: string;
  ensureConversation: () => Promise<string>;
}): Promise<SendResult> {
  const conversationId = activeId || (await ensureConversation());
  const data = await apiFetch<{
    userMessage: Message;
    answerMessage: Message;
    conversation: Conversation;
  }>(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: question, scope, citations, multiTurn }),
  });
  if (!data) {
    const previous = [...conversations]
      .reverse()
      .map((c) => c.messages)
      .flat()
      .reverse()
      .find((m) => m.role === "assistant" && m.kind)?.kind;
    const kind = identifyAnswer(
      question,
      scope,
      multiTurn ? previous : undefined,
    );
    const answer: Message = {
      id: uid(),
      role: "assistant",
      content: answers[kind],
      kind,
      citations,
    };
    return { conversationId, answer, mode: "offline" };
  }
  return {
    conversationId: data.conversation.id,
    answer: data.answerMessage,
    mode: "server",
  };
}
