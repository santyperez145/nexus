import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { handleChat } from "@/lib/gateway/handle-chat";
import type { ChatInputMessage } from "@/lib/gateway/types";
import { canExecuteHubSpace, findHubSpace, recordHubSpaceRun } from "@/lib/hub/space-store";
import { invalidSpaceInput, runSpaceSchema } from "@/lib/hub/spaces";

type Context = { params: Promise<{ namespace: string; slug: string }> };

export const maxDuration = 300;

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const space = await findHubSpace(namespace, slug);
    if (!space || !canExecuteHubSpace(space, auth)) {
      throw Object.assign(new Error("space not found"), { status: 404, code: "not_found" });
    }
    const parsed = runSpaceSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidSpaceInput(parsed.error);
    const messages: ChatInputMessage[] = [
      ...(space.systemPrompt
        ? [{ role: "system" as const, content: space.systemPrompt }]
        : []),
      ...(parsed.data.messages ?? []),
      ...(parsed.data.prompt ? [{ role: "user" as const, content: parsed.data.prompt }] : []),
    ];
    const headers = new Headers(req.headers);
    headers.set("x-nexus-title", `Space: ${space.namespace}/${space.slug}`);
    headers.set("x-nexus-space", `${space.namespace}/${space.slug}`);
    const response = await handleChat(
      {
        model: space.model,
        messages,
        temperature: space.temperatureMilli / 1_000,
        max_tokens: space.maxTokens,
        stream: false,
      },
      auth,
      headers,
      req.signal,
    );
    const generationId = response.headers.get("x-request-id");
    if (response.ok && generationId) {
      await recordHubSpaceRun(auth, space, generationId).catch((error) => {
        console.error("Failed to record Space execution", {
          spaceId: space.id,
          generationId,
          message: error instanceof Error ? error.message : "unknown",
        });
      });
      response.headers.set("x-nexus-space", `${space.namespace}/${space.slug}`);
    }
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
