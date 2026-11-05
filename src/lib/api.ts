export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(path, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
