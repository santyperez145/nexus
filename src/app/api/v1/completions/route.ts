import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import type { ChatRequest } from "@/lib/gateway/types";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = (await req.json()) as ChatRequest & { prompt?: string };
    const mapped: ChatRequest = {
      ...body,
      messages: body.messages ?? (body.prompt ? [{ role: "user", content: body.prompt }] : undefined),
    };
    return await handleChat(mapped, auth, req.headers);
  } catch (error) {
    return jsonError(error);
  }
}
