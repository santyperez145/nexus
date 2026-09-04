import { authenticateRequest } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import { reshapeChatResponse } from "@/lib/gateway/openai-compat";
import { anthropicInputToMessages, anthropicTools } from "@/lib/gateway/protocol-input";
import type { ChatRequest } from "@/lib/gateway/types";
import { anthropicJsonError } from "@/lib/gateway/errors";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const mapped: ChatRequest = {
      ...body,
      model: body.model,
      models: body.fallbacks?.map((f: { model?: string }) => f.model).filter(Boolean) ?? body.models,
      messages: anthropicInputToMessages(body.system, body.messages),
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      top_p: body.top_p,
      top_k: body.top_k,
      stop: body.stop_sequences,
      stream: body.stream,
      stream_options: body.stream ? { include_usage: true } : body.stream_options,
      tools: anthropicTools(body.tools),
      tool_choice: body.tool_choice,
      provider: body.provider,
    };
    const res = await handleChat(mapped, auth, req.headers, req.signal);
    return await reshapeChatResponse(res, "anthropic");
  } catch (error) {
    return anthropicJsonError(error);
  }
}
