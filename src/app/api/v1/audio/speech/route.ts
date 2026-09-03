import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { synthesizeSpeech } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const text = String(body.input ?? body.text ?? "");
    if (!text) return jsonError(Object.assign(new Error("input required"), { status: 400 }));
    const model = String(body.model ?? "openai/tts");
    const apiKey = await resolveByokKey(auth.userId, "openai");
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey) && !platform;
    if (!apiKey && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for TTS. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const charK = Math.max(1, text.length / 1000);
    const usd = MEDIA_DEFAULT_USD.speech * charK;
    const reserved = await holdMediaCredits({ auth, modality: "speech", isByok, usd });
    const started = Date.now();
    try {
      const live = await synthesizeSpeech({
        input: text,
        model: body.model,
        voice: body.voice,
        format: body.response_format,
        apiKey,
      });
      if (live && "error" in live) {
        await releaseReserve(auth, reserved);
        return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
      }
      if (!(live && "buffer" in live && live.buffer)) {
        await releaseReserve(auth, reserved);
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
        promptTokens: Math.ceil(text.length / 4),
        latencyMs: Date.now() - started,
        reservedMicros: reserved,
      });
      const bytes = new Uint8Array(live.buffer);
      return new Response(bytes, {
        headers: {
          "Content-Type": live.contentType || "audio/mpeg",
          "X-Nexus-TTS": model,
          "X-Request-Id": billed.id,
          "X-Nexus-Cost": String(billed.costMicros / 1_000_000),
        },
      });
    } catch (error) {
      await releaseReserve(auth, reserved);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
