import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { resolveByokKey } from "@/lib/gateway/byok";
import { chargeAndRecordMedia, MEDIA_DEFAULT_USD } from "@/lib/gateway/media-billing";
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
    const started = Date.now();
    const live = await generateImage({
      prompt,
      model: body.model,
      size: body.size,
      n,
      apiKey,
    });
    if (live && "error" in live) {
      return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
    }
    const local = !(live && "data" in live);
    const billed = await chargeAndRecordMedia({
      auth,
      headers: req.headers,
      modality: "image",
      model,
      provider: local ? "local" : isByok ? "openai-byok" : "openai",
      local,
      isByok,
      usd: MEDIA_DEFAULT_USD.image * n,
      latencyMs: Date.now() - started,
      metadata: { n, size: body.size ?? "1024x1024" },
    });
    if (live && "data" in live) {
      return Response.json({ ...live, id: billed.id, cost: billed.costMicros / 1_000_000 });
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><rect fill='#111' width='100%' height='100%'/><text x='50%' y='50%' fill='#f59e0b' font-size='28' text-anchor='middle'>Nexus · ${prompt.slice(0, 48)}</text></svg>`;
    const b64 = Buffer.from(svg).toString("base64");
    return Response.json({
      id: billed.id,
      created: Math.floor(Date.now() / 1000),
      data: [{ b64_json: b64, url: `data:image/svg+xml;base64,${b64}` }],
      cost: 0,
      warning: "Sin OPENAI_API_KEY ni BYOK openai: imagen placeholder local",
    });
  } catch (error) {
    return jsonError(error);
  }
}
