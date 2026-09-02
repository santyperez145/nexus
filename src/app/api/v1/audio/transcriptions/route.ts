import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { transcribeAudio } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    await authenticateRequest(req);
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const model = String(form.get("model") ?? "whisper-1");
      if (file instanceof File) {
        const live = await transcribeAudio(file, file.name, model);
        if (live && "text" in live) return Response.json(live);
        if (live && "error" in live) {
          return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
        }
        return Response.json({ text: `[Nexus STT] transcripción local de ${file.name}` });
      }
    }
    const body = await req.json().catch(() => ({}));
    return Response.json({
      text: `[Nexus STT] ${String((body as { prompt?: string }).prompt ?? "audio recibido")}`,
    });
  } catch (error) {
    return jsonError(error);
  }
}
