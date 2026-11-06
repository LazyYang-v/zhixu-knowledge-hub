// @vitest-environment node
import { expect, it } from "vitest";
import { createApp } from "../../server/app";
import { Store } from "../../server/lib/store";
import { createSeedDb } from "../../server/data/seed";
class MemoryStore extends Store {
  state = createSeedDb();
  constructor() {
    super(createSeedDb());
  }
  override async load() {
    return this.state;
  }
  override async update<T>(mutate: (db: ReturnType<typeof createSeedDb>) => T) {
    return mutate(this.state);
  }
}
it("honors disabled multi-turn and supports clearing feedback", async () => {
  const app = createApp(new MemoryStore());
  const response = await app.request(
    "/api/conversations/annual-leave/messages",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "申请",
        scope: "全部知识库",
        multiTurn: false,
      }),
    },
  );
  const body = await response.json();
  expect(body.answerMessage.kind).toBe("unknown");
  const feedback = await app.request(
    `/api/conversations/annual-leave/messages/${body.answerMessage.id}/feedback`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: null }),
    },
  );
  expect(feedback.status).toBe(200);
  expect((await feedback.json()).message.feedback).toBeUndefined();
});
