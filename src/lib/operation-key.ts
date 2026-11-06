const pending = new Map<string, { key: string; expires: number }>();
export async function operationKey(method: string, path: string, body: string) {
  const signature = JSON.stringify([method, path, body]);
  const digest = globalThis.crypto?.subtle
    ? Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(signature),
          ),
        ),
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    : undefined;
  const fingerprint = digest ?? signature;
  const storageKey = digest
    ? `knowledge-hub:pending-operation:${digest}`
    : undefined;
  let saved = pending.get(fingerprint);
  if (storageKey) {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {
      /* In-memory retry remains available. */
    }
  }
  if (!saved || saved.expires <= Date.now()) {
    saved = { key: crypto.randomUUID(), expires: Date.now() + 24 * 3600_000 };
  }
  if (pending.size >= 100)
    for (const [key, record] of pending) {
      if (record.expires <= Date.now() || pending.size >= 100)
        pending.delete(key);
    }
  pending.set(fingerprint, saved);
  if (storageKey) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* No raw request data is persisted. */
    }
  }
  return {
    key: saved.key,
    complete: () => {
      pending.delete(fingerprint);
      if (storageKey) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      }
    },
  };
}
