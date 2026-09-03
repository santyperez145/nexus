import type { ChatChunk } from "./types.js";

export async function* iterateSSE(res: Response): AsyncGenerator<ChatChunk> {
  if (!res.body) throw new Error("Empty stream body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.replace(/^data:\s*/, "").trim();
      if (!line || line === "[DONE]") continue;
      try {
        yield JSON.parse(line) as ChatChunk;
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}
