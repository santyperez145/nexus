import { parseBlob } from "music-metadata";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { transcribeAudio } from "@/lib/media/upstream";
import { assertRateLimit } from "@/lib/gateway/rate-limit";
import { MEDIA_PRICE_VERSION, quoteTranscription } from "@/lib/media/pricing";
import { assertMediaPrivacy, canUseByokForMedia } from "@/lib/gateway/media-privacy";
import { shouldRetainPayloads } from "@/lib/privacy/retention";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    await assertRateLimit(auth);
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return jsonError(Object.assign(new Error("multipart file required"), { status: 400 }));
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(Object.assign(new Error("multipart file required"), { status: 400 }));
    }
    if (file.size < 1 || file.size > MAX_AUDIO_BYTES) {
      return jsonError(Object.assign(new Error("audio file must be between 1 byte and 25 MiB"), { status: 413 }));
    }
    let durationSeconds = 0;
    try {
      const metadata = await parseBlob(file, { duration: true });
      durationSeconds = metadata.format.duration ?? 0;
    } catch {
      return jsonError(Object.assign(new Error("could not determine audio duration"), { status: 400 }));
    }
    const quote = quoteTranscription({
      model: form.get("model"),
      durationSeconds,
    });
    if (!quote) {
      return jsonError(
        Object.assign(new Error("unsupported transcription model or audio duration"), {
          status: 400,
          code: "invalid_request",
        }),
      );
    }
    const byok = await resolveByokKey(auth.userId, "openai", auth);
    const apiKey = canUseByokForMedia(auth) ? byok : undefined;
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey);
    assertMediaPrivacy(auth, "openai", isByok);
    if (!apiKey && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for STT. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const started = Date.now();
    const reservation = await holdMediaCredits({
      auth,
      modality: "transcription",
      isByok,
      usd: quote.usd,
    });

    try {
      const live = await transcribeAudio(file, file.name, quote.model, apiKey);
      if (live && "error" in live) {
        await releaseReserve(auth, reservation);
        return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
      }
      if (!(live && "text" in live)) {
        await releaseReserve(auth, reservation);
        return jsonError(Object.assign(new Error("STT provider returned no text"), { status: 502 }));
      }
      const billed = await chargeAndRecordMedia({
        auth,
        headers: req.headers,
        modality: "transcription",
        model: `openai/${quote.model}`,
        provider: isByok ? "openai-byok" : "openai",
        local: false,
        isByok,
        usd: quote.usd,
        latencyMs: Date.now() - started,
        metadata: {
          ...(shouldRetainPayloads(auth) ? { filename: file.name } : {}),
          bytes: file.size,
          duration_seconds: durationSeconds,
          price_version: MEDIA_PRICE_VERSION,
        },
        reservation,
      });
      return Response.json({
        ...live,
        id: billed.id,
        model: `openai/${quote.model}`,
        duration: durationSeconds,
        cost: billed.costMicros / 1_000_000,
        price_version: MEDIA_PRICE_VERSION,
      });
    } catch (error) {
      await releaseReserve(auth, reservation);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
