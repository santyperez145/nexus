import { findModel } from "@/lib/catalog";
import { isEndpointNoTrainingConfirmed, isEndpointZdrConfirmed } from "@/lib/providers/privacy";

function publicEndpoint(endpoint: NonNullable<ReturnType<typeof findModel>>["endpoints"][number]) {
  return {
    name: endpoint.adapter,
    tag: endpoint.adapter,
    provider_name: endpoint.adapter,
    adapter: endpoint.adapter,
    provider_model: endpoint.providerModel,
    pricing: endpoint.pricing,
    pricing_verified: endpoint.pricingVerified === true,
    free: endpoint.free === true,
    latency_ms: endpoint.latencyMs,
    throughput_tps: endpoint.throughputTps,
    zdr: isEndpointZdrConfirmed(endpoint),
    zdr_capable: Boolean(endpoint.zdr),
    no_training: isEndpointNoTrainingConfirmed(endpoint),
    uptime: endpoint.uptime,
    quantization: endpoint.quantization,
    verified: Boolean(endpoint.verified),
    metrics_estimated: endpoint.metricsEstimated !== false,
  };
}

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
        endpoints: model.endpoints.map(publicEndpoint),
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
      endpoints: model.endpoints.map(publicEndpoint),
    },
  });
}
