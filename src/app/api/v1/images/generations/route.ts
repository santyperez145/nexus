import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { generateImage } from "@/lib/media/upstream";

export async function POST(req: Request) {
  try {
    await authenticateRequest(req);
    const body = await req.json();
    const prompt = String(body.prompt ?? "");
    if (!prompt) return jsonError(Object.assign(new Error("prompt required"), { status: 400 }));
    const live = await generateImage({
      prompt,
      model: body.model,
      size: body.size,
      n: body.n,
    });
    if (live && "data" in live) return Response.json(live);
    if (live && "error" in live) {
      return jsonError(Object.assign(new Error(String(live.error)), { status: live.status ?? 502 }));
    }
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'><rect fill='#111' width='100%' height='100%'/><text x='50%' y='50%' fill='#f59e0b' font-size='28' text-anchor='middle'>Nexus · ${prompt.slice(0, 48)}</text></svg>`;
    const b64 = Buffer.from(svg).toString("base64");
    return Response.json({
      created: Math.floor(Date.now() / 1000),
      data: [{ b64_json: b64, url: `data:image/svg+xml;base64,${b64}` }],
      warning: "OPENAI_API_KEY ausente: imagen placeholder local",
    });
  } catch (error) {
    return jsonError(error);
  }
}
