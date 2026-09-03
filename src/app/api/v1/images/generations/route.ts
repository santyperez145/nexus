import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { generateImage } from "@/lib/media/upstream";
import { assertRateLimit } from "@/lib/gateway/rate-limit";
import { MEDIA_PRICE_VERSION, quoteImage } from "@/lib/media/pricing";
import { assertMediaPrivacy, canUseByokForMedia } from "@/lib/gateway/media-privacy";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    const body = await req.json();
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt || prompt.length > 32_000) {
      return jsonError(Object.assign(new Error("prompt must contain 1 to 32000 characters"), { status: 400 }));
    }
    const quote = quoteImage(body);
    if (!quote) {
      return jsonError(
        Object.assign(new Error("unsupported image model, size, quality or image count"), {
          status: 400,
          code: "invalid_request",
        }),
      );
    }
    const model = `openai/${quote.model}`;
    const byok = await resolveByokKey(auth.userId, "openai", auth);
    const apiKey = canUseByokForMedia(auth) ? byok : undefined;
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey);
    assertMediaPrivacy(auth, "openai", isByok);
    if (!apiKey && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for images. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const usd = quote.usd;
    const reservation = await holdMediaCredits({ auth, modality: "image", isByok, usd });
    const started = Date.now();
    try {
      const live = await generateImage({
        prompt,
        model: quote.model,
        size: quote.size,
        quality: quote.quality,
        n: quote.n,
        apiKey,
      });
      if (live && "error" in live) {
        await releaseReserve(auth, reservation);
        return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
      }
      const billed = await chargeAndRecordMedia({
        auth,
        headers: req.headers,
        modality: "image",
        model,
        provider: isByok ? "openai-byok" : "openai",
        local: false,
        isByok,
        usd,
        latencyMs: Date.now() - started,
        metadata: {
          n: quote.n,
          size: quote.size,
          quality: quote.quality,
          unit_usd: quote.unitUsd,
          price_version: MEDIA_PRICE_VERSION,
        },
        reservation,
      });
      if (live && "data" in live) {
        return Response.json({
          ...live,
          id: billed.id,
          model,
          cost: billed.costMicros / 1_000_000,
          price_version: MEDIA_PRICE_VERSION,
        });
      }
      await releaseReserve(auth, reservation);
      return jsonError(
        Object.assign(new Error("Image provider returned no data"), { status: 502, code: "provider_error" }),
      );
    } catch (error) {
      await releaseReserve(auth, reservation);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
