import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../src/lib/api";
afterEach(() => vi.unstubAllGlobals());
it("preserves HTTP error information and never converts a refusal to demo", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "拒绝访问",
          code: "FORBIDDEN",
          requestId: "r1",
        }),
        { status: 403 },
      ),
    ),
  );
  await expect(apiFetch("/api/test")).rejects.toMatchObject({
    status: 403,
    code: "FORBIDDEN",
    requestId: "r1",
  });
});
it("isolates demo mode from server reads and writes", async () => {
  localStorage.setItem("knowledge-hub:data-mode", "demo");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await apiFetch("/api/test", { method: "DELETE" })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("accepts authoritative empty responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response('{"documents":[]}')),
  );
  expect(await apiFetch("/api/test")).toEqual({ documents: [] });
});
it("accepts the committed grant receipt and rejects a malformed receipt", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(new Response('{"base":{"id":"wrong-shape"}}')),
  );
  expect(
    await apiFetch("/api/knowledge/bases/b1/grants", {
      method: "PUT",
      body: '{"revision":1,"grants":[]}',
    }),
  ).toEqual({ ok: true });
  await expect(
    apiFetch("/api/knowledge/bases/b1/grants", {
      method: "PUT",
      body: '{"revision":2,"grants":[]}',
    }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("reports network failures without inventing data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(apiFetch("/api/test")).rejects.toMatchObject({
    code: "NETWORK_ERROR",
  });
});
it("distinguishes invalid successful payloads and aborted requests", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid")));
  await expect(apiFetch("/api/test")).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  const abort = new AbortController();
  abort.abort();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
  );
  await expect(
    apiFetch("/api/test", { signal: abort.signal }),
  ).rejects.toMatchObject({ code: "ABORTED" });
});
it("rejects malformed domain responses instead of creating fallback records", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  await expect(
    apiFetch("/api/knowledge/bases", { method: "POST", body: '{"name":"x"}' }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("times out requests with an actionable error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_path: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("timeout", "AbortError")),
          ),
        ),
    ),
  );
  await expect(apiFetch("/api/test", undefined, 5)).rejects.toMatchObject({
    code: "TIMEOUT",
  });
});
it("reuses an operation key when the server response is lost", async () => {
  const keys: string[] = [];
  let count = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: unknown, init: RequestInit) => {
      keys.push(new Headers(init.headers).get("Idempotency-Key")!);
      if (count++ === 0) throw new TypeError("lost response");
      return new Response('{"base":{"id":"saved"}}');
    }),
  );
  await expect(
    apiFetch("/api/knowledge/bases", {
      method: "POST",
      body: '{"name":"幂等客户端"}',
    }),
  ).rejects.toThrow();
  await apiFetch("/api/knowledge/bases", {
    method: "POST",
    body: '{"name":"幂等客户端"}',
  });
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});
