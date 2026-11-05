import { useLocalStorage } from "../../lib/storage";
import { apiFetch } from "../../lib/api";

export type FeedbackRating = "up" | "down";

export function useFeedback() {
  const [feedback, setFeedback] = useLocalStorage<Record<string, string>>(
    "answer-feedback",
    {},
  );
  const record = (
    conversationId: string | undefined,
    messageId: string,
    rating: FeedbackRating,
  ) => {
    if (conversationId)
      apiFetch(
        `/api/conversations/${conversationId}/messages/${messageId}/feedback`,
        { method: "PATCH", body: JSON.stringify({ rating }) },
      );
    setFeedback((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === rating ? "" : rating,
    }));
  };
  return { feedback, record };
}
