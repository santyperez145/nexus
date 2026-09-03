import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { synthesizeSpeech } from "@/lib/media/upstream";
import { assertRateLimit } from "@/lib/gateway/rate-limit";
import {
  MEDIA_PRICE_VERSION,
  SPEECH_FORMATS,
  quoteSpeech,
} from "@/lib/media/pricing";
import { assertMediaPrivacy, canUseByokForMedia } from "@/lib/gateway/media-privacy";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    const body = await req.json();
    const input = String(body.input ?? body.text ?? "").trim();
    const quote = quoteSpeech({ model: body.model, characters: input.length });
    if (!quote) {
      return jsonError(
        Object.assign(new Error("unsupported speech model or input outside the 1-4096 character limit"), {
          status: 400,
          code: "invalid_request",
        }),
      );
    }
    const format = String(body.response_format ?? "mp3").toLowerCase();
    if (!SPEECH_FORMATS.includes(format as (typeof SPEECH_FORMATS)[number])) {
      return jsonError(Object.assign(new Error("unsupported response_format"), { status: 400 }));
    }
    const speed = body.speed == null ? undefined : Number(body.speed);
    if (speed != null && (!Number.isFinite(speed) || speed < 0.25 || speed > 4)) {
      return jsonError(Object.assign(new Error("speed must be between 0.25 and 4"), { status: 400 }));
    }
    const instructions = body.instructions == null ? undefined : String(body.instructions).trim();
    if (instructions && instructions.length > 4096) {
      return jsonError(Object.assign(new Error("instructions exceed 4096 characters"), { status: 400 }));
    }
    const model = `openai/${quote.model}`;
    const byok = await resolveByokKey(auth.userId, "openai", auth);
    const apiKey = canUseByokForMedia(auth) ? byok : undefined;
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey);
    assertMediaPrivacy(auth, "openai", isByok);
    if (!apiKey && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for TTS. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const usd = quote.usd;
    const reservation = await holdMediaCredits({ auth, modality: "speech", isByok, usd });
    const started = Date.now();
    try {
      const live = await synthesizeSpeech({
        input,
        model: quote.model,
        voice: body.voice,
        format,
        speed,
        instructions,
        apiKey,
      });
      if (live && "error" in live) {
        await releaseReserve(auth, reservation);
        return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
      }
      if (!(live && "buffer" in live && live.buffer)) {
        await releaseReserve(auth, reservation);
        return jsonError(Object.assign(new Error("TTS provider returned no audio"), { status: 502 }));
      }
      const billed = await chargeAndRecordMedia({
        auth,
        headers: req.headers,
        modality: "speech",
        model,
        provider: isByok ? "openai-byok" : "openai",
        local: false,
        isByok,
        usd,
        promptTokens: Math.ceil(input.length / 4),
        latencyMs: Date.now() - started,
        metadata: {
          characters: input.length,
          voice: body.voice ?? "alloy",
          format,
          price_version: MEDIA_PRICE_VERSION,
        },
        reservation,
      });
      const bytes = new Uint8Array(live.buffer);
      return new Response(bytes, {
        headers: {
          "Content-Type": live.contentType || "audio/mpeg",
          "X-Nexus-TTS": model,
          "X-Request-Id": billed.id,
          "X-Nexus-Cost": String(billed.costMicros / 1_000_000),
          "X-Nexus-Price-Version": MEDIA_PRICE_VERSION,
        },
      });
    } catch (error) {
      await releaseReserve(auth, reservation);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
