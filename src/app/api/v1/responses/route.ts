import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import { reshapeChatResponse } from "@/lib/gateway/openai-compat";
import { responseFileIds, responsesInputToMessages } from "@/lib/gateway/protocol-input";
import type { ChatRequest } from "@/lib/gateway/types";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const messages = responsesInputToMessages(body.input, body.instructions);
    if (!messages.length) {
      throw Object.assign(new Error("input is required"), { status: 400, code: "invalid_request" });
    }
    const format = body.text?.format;
    const mapped: ChatRequest = {
      ...body,
      model: body.model,
      messages,
      stream: body.stream,
      temperature: body.temperature,
      max_tokens: body.max_output_tokens ?? body.max_tokens,
      tools: body.tools,
      tool_choice: body.tool_choice,
      response_format: format
        ? {
            type: format.type,
            ...(format.schema ? { json_schema: format.schema } : {}),
          }
        : body.response_format,
      file_ids: [...new Set([...(body.file_ids ?? []), ...responseFileIds(body.input)])],
      provider: body.provider,
    };
    const res = await handleChat(mapped, auth, req.headers, req.signal);
    return await reshapeChatResponse(res, "response");
  } catch (error) {
    return jsonError(error);
  }
}
