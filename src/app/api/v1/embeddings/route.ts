import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { embedTexts } from "@/lib/gateway/providers";
import { findModel } from "@/lib/catalog";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const input = Array.isArray(body.input) ? body.input : [body.input];
    const requested = String(body.model ?? "openai/text-embedding-3-small");
    const catalog = findModel(requested);
    const pricing = catalog?.endpoints[0]?.pricing ?? catalog?.pricing ?? { prompt: 0.00000002, completion: 0 };
    const providerModel = catalog?.endpoints[0]?.providerModel ?? requested.split("/").pop() ?? requested;
    const byok = await resolveByokKey(auth.userId, "openai");
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(byok) && !platform;
    const promptTokens = Math.ceil(input.join(" ").length / 4);
    const reserved = await holdMediaCredits({
      auth,
      modality: "embedding",
      isByok,
      promptTokens,
      pricing: { prompt: pricing.prompt, completion: pricing.completion ?? 0 },
    });
    const started = Date.now();
    let settled = false;
    try {
      const embeddings = await embedTexts(input.map(String), providerModel, byok);
      const billed = await chargeAndRecordMedia({
        auth,
        headers: req.headers,
        modality: "embedding",
        model: requested,
        provider: isByok ? "openai-byok" : "openai",
        local: false,
        isByok,
        promptTokens,
        completionTokens: 0,
        pricing: { prompt: pricing.prompt, completion: pricing.completion ?? 0 },
        latencyMs: Date.now() - started,
        reservedMicros: reserved,
      });
      settled = true;
      return Response.json({
        object: "list",
        data: embeddings.map((embedding, index) => ({ object: "embedding", embedding, index })),
        model: requested,
        usage: {
          prompt_tokens: promptTokens,
          total_tokens: promptTokens,
          cost: billed.costMicros / 1_000_000,
        },
        id: billed.id,
        is_byok: isByok,
      });
    } catch (error) {
      if (!settled) await releaseReserve(auth, reserved);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
