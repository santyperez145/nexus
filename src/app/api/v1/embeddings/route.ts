import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { embedTexts } from "@/lib/gateway/providers";
import { findModel } from "@/lib/catalog";
import { assertRateLimit } from "@/lib/gateway/rate-limit";
import { supportedEmbeddingModel } from "@/lib/media/pricing";
import { assertMediaPrivacy, canUseByokForMedia } from "@/lib/gateway/media-privacy";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    const body = await req.json();
    const rawInput: unknown[] = Array.isArray(body.input) ? body.input : [body.input];
    const input = rawInput.map((value: unknown) =>
      typeof value === "string" ? value : "",
    );
    const totalCharacters = input.reduce((total, value) => total + value.length, 0);
    if (
      !input.length ||
      input.length > 2048 ||
      totalCharacters > 1_000_000 ||
      input.some((value) => !value || value.length > 32_000)
    ) {
      return jsonError(
        Object.assign(
          new Error("input must contain 1-2048 non-empty strings, at most 32000 characters each and 1000000 total"),
          {
            status: 400,
            code: "invalid_request",
          },
        ),
      );
    }
    const providerModel = supportedEmbeddingModel(body.model);
    if (!providerModel) {
      return jsonError(
        Object.assign(new Error("unsupported embedding model"), { status: 400, code: "invalid_request" }),
      );
    }
    const requested = `openai/${providerModel}`;
    const catalog = findModel(requested);
    const pricing = catalog?.endpoints[0]?.pricing ?? catalog?.pricing ?? { prompt: 0.00000002, completion: 0 };
    const byok = await resolveByokKey(auth.userId, "openai", auth);
    const apiKey = canUseByokForMedia(auth) ? byok : undefined;
    const isByok = Boolean(apiKey);
    assertMediaPrivacy(auth, "openai", isByok);
    if (!apiKey && !process.env.OPENAI_API_KEY?.trim()) {
      return jsonError(
        Object.assign(new Error("No provider credentials for embeddings. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const promptTokens = Math.ceil(input.join(" ").length / 4);
    const reservation = await holdMediaCredits({
      auth,
      modality: "embedding",
      isByok,
      promptTokens,
      pricing: { prompt: pricing.prompt, completion: pricing.completion ?? 0 },
    });
    const started = Date.now();
    let settled = false;
    try {
      const embeddings = await embedTexts(input.map(String), providerModel, apiKey);
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
        reservation,
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
      if (!settled) await releaseReserve(auth, reservation);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
