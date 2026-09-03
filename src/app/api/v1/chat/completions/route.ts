import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import type { ChatRequest } from "@/lib/gateway/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = (await req.json()) as ChatRequest;
    return await handleChat(body, auth, req.headers, req.signal);
  } catch (error) {
    return jsonError(error);
  }
}
