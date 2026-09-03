import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { transcribeAudio } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const apiKey = await resolveByokKey(auth.userId, "openai");
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey) && !platform;
    if (!apiKey && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for STT. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const contentType = req.headers.get("content-type") ?? "";
    const started = Date.now();
    const reserved = await holdMediaCredits({
      auth,
      modality: "transcription",
      isByok,
      usd: MEDIA_DEFAULT_USD.transcription,
    });

    try {
      if (contentType.includes("multipart/form-data")) {
        const form = await req.formData();
        const file = form.get("file");
        const model = String(form.get("model") ?? "whisper-1");
        if (file instanceof File) {
          const live = await transcribeAudio(file, file.name, model, apiKey);
          if (live && "error" in live) {
            await releaseReserve(auth, reserved);
            return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
          }
          if (!(live && "text" in live)) {
            await releaseReserve(auth, reserved);
            return jsonError(Object.assign(new Error("STT provider returned no text"), { status: 502 }));
          }
          const billed = await chargeAndRecordMedia({
            auth,
            headers: req.headers,
            modality: "transcription",
            model,
            provider: isByok ? "openai-byok" : "openai",
            local: false,
            isByok,
            usd: MEDIA_DEFAULT_USD.transcription,
            latencyMs: Date.now() - started,
            metadata: { filename: file.name, bytes: file.size },
            reservedMicros: reserved,
          });
          return Response.json({ ...live, id: billed.id, cost: billed.costMicros / 1_000_000 });
        }
      }
      await releaseReserve(auth, reserved);
      return jsonError(Object.assign(new Error("multipart file required"), { status: 400 }));
    } catch (error) {
      await releaseReserve(auth, reserved);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
