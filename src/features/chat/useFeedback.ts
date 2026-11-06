import { apiFetch } from "../../lib/api";
import { useDataState } from "../../lib/storage";
export type FeedbackRating = "up" | "down";
export function useFeedback() {
  const [feedback, setFeedback] = useDataState<Record<string, string>>(
    "answer-feedback",
    {},
    {},
  );
  const record = async (
    conversationId: string | undefined,
    messageId: string,
    rating: FeedbackRating,
    persisted?: FeedbackRating,
  ) => {
    if (!conversationId) return;
    const next = (feedback[messageId] ?? persisted) === rating ? null : rating;
    await apiFetch(
      `/api/conversations/${conversationId}/messages/${messageId}/feedback`,
      { method: "PATCH", body: JSON.stringify({ rating: next }) },
    );
    setFeedback((prev) => ({ ...prev, [messageId]: next ?? "" }));
  };
  return { feedback, record };
}
