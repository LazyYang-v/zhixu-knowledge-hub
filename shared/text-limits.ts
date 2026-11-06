// Resource bounds for the current single-process JSON implementation, not measured performance targets.
export const MAX_CHUNKS = 10_000;
export const MAX_CHUNK_CHARACTERS = 100_000;
export const MAX_TOTAL_CHUNK_CHARACTERS = 8_000_000;

export function validateChunks(chunks: string[]): string[] {
  if (!chunks.length || chunks.length > MAX_CHUNKS)
    throw new Error("CHUNK_COUNT_LIMIT");
  let total = 0;
  for (const chunk of chunks) {
    if (
      typeof chunk !== "string" ||
      !chunk.trim() ||
      chunk.length > MAX_CHUNK_CHARACTERS
    )
      throw new Error("INVALID_CHUNK_CONTENT");
    total += chunk.length;
    if (total > MAX_TOTAL_CHUNK_CHARACTERS)
      throw new Error("CHUNK_EXPANSION_LIMIT");
  }
  return [...chunks];
}
