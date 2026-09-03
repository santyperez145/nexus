import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import { reshapeChatResponse } from "@/lib/gateway/openai-compat";
import type { ChatMessage, ChatRequest } from "@/lib/gateway/types";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const input = body.input;
    const messages: ChatMessage[] = Array.isArray(input)
      ? input.map((item: unknown) => {
          if (typeof item === "string") return { role: "user" as const, content: item };
          if (item && typeof item === "object" && "role" in item) return item as ChatMessage;
          if (item && typeof item === "object" && "content" in item) {
            const c = item as { type?: string; content?: unknown; text?: string; role?: string };
            return {
              role: (c.role as ChatMessage["role"]) ?? "user",
              content: typeof c.content === "string" ? c.content : (c.text ?? JSON.stringify(c.content ?? "")),
            };
          }
          return { role: "user" as const, content: JSON.stringify(item) };
        })
      : [{ role: "user", content: String(input ?? "") }];
    const mapped: ChatRequest = {
      ...body,
      model: body.model,
      messages,
      stream: body.stream,
      temperature: body.temperature,
      max_tokens: body.max_output_tokens ?? body.max_tokens,
      tools: body.tools,
      provider: body.provider,
    };
    const res = await handleChat(mapped, auth, req.headers);
    return await reshapeChatResponse(res, "response");
  } catch (error) {
    return jsonError(error);
  }
}
