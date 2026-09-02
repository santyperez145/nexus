import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import type { ChatMessage, ChatRequest } from "@/lib/gateway/types";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const input = body.input;
    const messages: ChatMessage[] = Array.isArray(input)
      ? input
      : [{ role: "user", content: String(input ?? "") }];
    const mapped: ChatRequest = {
      model: body.model,
      messages,
      stream: body.stream,
      temperature: body.temperature,
      max_tokens: body.max_output_tokens,
      tools: body.tools,
    };
    return await handleChat(mapped, auth, req.headers);
  } catch (error) {
    return jsonError(error);
  }
}
