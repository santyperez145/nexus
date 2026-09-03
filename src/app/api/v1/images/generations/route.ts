import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, holdMediaCredits, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
import { releaseReserve } from "@/lib/gateway/billing";
import { generateImage } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const prompt = String(body.prompt ?? "");
    if (!prompt) return jsonError(Object.assign(new Error("prompt required"), { status: 400 }));
    const model = String(body.model ?? "openai/gpt-image-1");
    const n = Math.min(4, Math.max(1, Number(body.n) || 1));
    const apiKey = await resolveByokKey(auth.userId, "openai");
    const platform = Boolean(process.env.OPENAI_API_KEY?.trim());
    const isByok = Boolean(apiKey) && !platform;
    if (!apiKey && !platform) {
      return jsonError(
        Object.assign(new Error("No provider credentials for images. Configure OPENAI_API_KEY or BYOK."), {
          status: 503,
          code: "provider_unwired",
        }),
      );
    }
    const usd = MEDIA_DEFAULT_USD.image * n;
    const reserved = await holdMediaCredits({ auth, modality: "image", isByok, usd });
    const started = Date.now();
    try {
      const live = await generateImage({
        prompt,
        model: body.model,
        size: body.size,
        n,
        apiKey,
      });
      if (live && "error" in live) {
        await releaseReserve(auth, reserved);
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
        metadata: { n, size: body.size ?? "1024x1024" },
        reservedMicros: reserved,
      });
      if (live && "data" in live) {
        return Response.json({ ...live, id: billed.id, cost: billed.costMicros / 1_000_000 });
      }
      await releaseReserve(auth, reserved);
      return jsonError(
        Object.assign(new Error("Image provider returned no data"), { status: 502, code: "provider_error" }),
      );
    } catch (error) {
      await releaseReserve(auth, reserved);
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
