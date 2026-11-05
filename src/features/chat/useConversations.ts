import { useEffect, useRef, useState } from "react";
import type { Conversation, Message } from "../../lib/chat-data";
import { initialConversations } from "../../lib/chat-data";
import { useLocalStorage } from "../../lib/storage";
import { apiFetch } from "../../lib/api";

interface LoadState {
  status: "loading" | "ready" | "error";
  source: "server" | "offline" | null;
}

const uid = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function nowTime() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function useConversations() {
  const [conversations, setConversations] = useLocalStorage<Conversation[]>(
    "conversations-v1",
    initialConversations,
  );
  const [activeId, setActiveId] = useLocalStorage(
    "active-conversation-v1",
    "annual-leave",
  );
  const [load, setLoad] = useState<LoadState>({
    status: "loading",
    source: null,
  });
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    apiFetch<{ conversations: Conversation[] }>("/api/conversations")
      .then((data) => {
        if (!mountedRef.current) return;
        if (data?.conversations.length) {
          setConversations(data.conversations);
          setActiveId(data.conversations[0].id);
          setLoad({ status: "ready", source: "server" });
        } else {
          setLoad({ status: "ready", source: data ? "server" : "offline" });
        }
      })
      .catch(() => {
        if (mountedRef.current)
          setLoad({ status: "ready", source: "offline" });
      });
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const addMessage = (
    conversationId: string,
    messages: Message[],
    newTitle?: string,
  ) =>
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              title: newTitle ?? c.title,
              messages: [...c.messages, ...messages],
            }
          : c,
      ),
    );
  return {
    conversations,
    setConversations,
    activeId,
    setActiveId,
    addMessage,
    loading: load.status === "loading",
    loadSource: load.source,
  };
}
