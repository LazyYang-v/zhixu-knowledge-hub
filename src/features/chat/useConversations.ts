import { useEffect } from "react";
import { useCollection } from "../../hooks/useCollection";
import type { Conversation } from "../../lib/chat-data";
import { initialConversations } from "../../lib/chat-data";
import { useLocalStorage } from "../../lib/storage";
export function useConversations() {
  const state = useCollection<Conversation, "conversations">(
    "/api/conversations",
    "conversations",
    "conversations-v1",
    initialConversations,
  );
  const [activeId, setActiveId] = useLocalStorage("active-conversation-v1", "");
  useEffect(() => {
    if (state.loading || state.error) return;
    if (!state.records.some((item) => item.id === activeId))
      setActiveId(state.records[0]?.id ?? "");
  }, [state.records, activeId, state.loading, state.error, setActiveId]);
  return {
    ...state,
    conversations: state.records,
    setConversations: state.setRecords,
    activeId,
    setActiveId,
    loadSource: state.source,
  };
}
