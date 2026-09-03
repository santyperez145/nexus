import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import { reshapeChatResponse } from "@/lib/gateway/openai-compat";
import type { ChatMessage, ChatRequest } from "@/lib/gateway/types";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const mapped: ChatRequest = {
      ...body,
      model: body.model,
      models: body.fallbacks?.map((f: { model?: string }) => f.model).filter(Boolean) ?? body.models,
      messages: (body.messages ?? []) as ChatMessage[],
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      stream: body.stream,
      tools: body.tools,
      provider: body.provider,
    };
    const res = await handleChat(mapped, auth, req.headers);
    return await reshapeChatResponse(res, "anthropic");
  } catch (error) {
    return jsonError(error);
  }
}
