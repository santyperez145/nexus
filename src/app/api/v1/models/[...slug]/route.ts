import { findModel } from "@/lib/catalog";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const wantsEndpoints = slug.at(-1) === "endpoints";
  const id = (wantsEndpoints ? slug.slice(0, -1) : slug).join("/");
  const model = findModel(id);
  if (!model) return Response.json({ error: { message: "Model not found" } }, { status: 404 });
  if (wantsEndpoints) {
    return Response.json({
      data: {
        id: model.id,
        name: model.name,
        endpoints: model.endpoints.map((e) => ({
          name: e.adapter,
          tag: e.adapter,
          provider_name: e.adapter,
          adapter: e.adapter,
          provider_model: e.providerModel,
          pricing: e.pricing,
          latency_ms: e.latencyMs,
          throughput_tps: e.throughputTps,
          zdr: e.zdr,
          uptime: e.uptime,
          quantization: e.quantization,
        })),
      },
    });
  }
  return Response.json({
    data: {
      id: model.id,
      name: model.name,
      description: model.description,
      context_length: model.contextLength,
      pricing: model.pricing,
      architecture: model.architecture,
      supported_parameters: model.supportedParameters,
      endpoints: model.endpoints,
    },
  });
}
