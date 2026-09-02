import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { embedTexts } from "@/lib/gateway/providers";
import { generationId } from "@/lib/ids";
import { findModel } from "@/lib/catalog";

export async function POST(req: Request) {
  try {
    await authenticateRequest(req);
    const body = await req.json();
    const input = Array.isArray(body.input) ? body.input : [body.input];
    const requested = String(body.model ?? "openai/text-embedding-3-small");
    const catalog = findModel(requested);
    const providerModel = catalog?.endpoints[0]?.providerModel ?? requested.split("/").pop() ?? requested;
    const embeddings = await embedTexts(input.map(String), providerModel);
    return Response.json({
      object: "list",
      data: embeddings.map((embedding, index) => ({ object: "embedding", embedding, index })),
      model: requested,
      usage: { prompt_tokens: Math.ceil(input.join(" ").length / 4), total_tokens: Math.ceil(input.join(" ").length / 4) },
      id: generationId(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
