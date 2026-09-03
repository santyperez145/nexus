import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
import { transcribeAudio } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const apiKey = await resolveByokKey(auth.userId, "openai");
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey) && !platform;
    const contentType = req.headers.get("content-type") ?? "";
    const started = Date.now();

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const model = String(form.get("model") ?? "whisper-1");
      if (file instanceof File) {
        const live = await transcribeAudio(file, file.name, model, apiKey);
        if (live && "error" in live) {
          return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
        }
        const local = !(live && "text" in live);
        const billed = await chargeAndRecordMedia({
          auth,
          headers: req.headers,
          modality: "transcription",
          model,
          provider: local ? "local" : isByok ? "openai-byok" : "openai",
          local,
          isByok,
          usd: MEDIA_DEFAULT_USD.transcription,
          latencyMs: Date.now() - started,
          metadata: { filename: file.name, bytes: file.size },
        });
        if (live && "text" in live) {
          return Response.json({ ...live, id: billed.id, cost: billed.costMicros / 1_000_000 });
        }
        return Response.json({
          id: billed.id,
          text: `[Nexus STT] transcripción local de ${file.name}`,
          cost: 0,
        });
      }
    }
    const body = await req.json().catch(() => ({}));
    const billed = await chargeAndRecordMedia({
      auth,
      headers: req.headers,
      modality: "transcription",
      model: "whisper-1",
      provider: "local",
      local: true,
      isByok: false,
      usd: 0,
      latencyMs: Date.now() - started,
    });
    return Response.json({
      id: billed.id,
      text: `[Nexus STT] ${String((body as { prompt?: string }).prompt ?? "audio recibido")}`,
      cost: 0,
    });
  } catch (error) {
    return jsonError(error);
  }
}
