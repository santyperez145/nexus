import { allModels } from "@/lib/catalog";
import { usdPerMillion } from "@/lib/catalog";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const output = url.searchParams.get("output_modalities");
  const category = url.searchParams.get("category");
  const supported = url.searchParams.get("supported_parameters");
  let models = allModels();
  if (output) {
    const wanted = output.split(",").map((s) => s.trim());
    models = models.filter((m) => wanted.every((w) => m.architecture.outputModalities.includes(w)));
  }
  if (category === "free") models = models.filter((m) => m.free);
  if (supported) {
    models = models.filter((m) => m.supportedParameters.includes(supported));
  }
  const data = models.map((m) => ({
    id: m.id,
    canonical_slug: m.canonicalSlug,
    hugging_face_id: m.huggingFaceId,
    name: m.name,
    created: m.created,
    description: m.description,
    context_length: m.contextLength,
    architecture: {
      modality: m.architecture.modality,
      input_modalities: m.architecture.inputModalities,
      output_modalities: m.architecture.outputModalities,
      tokenizer: m.architecture.tokenizer,
    },
    pricing: {
      prompt: String(m.pricing.prompt),
      completion: String(m.pricing.completion),
      request: String(m.pricing.request),
      image: String(m.pricing.image),
    },
    top_provider: {
      context_length: m.topProvider.contextLength,
      max_completion_tokens: m.topProvider.maxCompletionTokens,
      is_moderated: m.topProvider.isModerated,
    },
    supported_parameters: m.supportedParameters,
    per_request_limits: null,
    nexus: {
      prompt_per_million: usdPerMillion(m.pricing.prompt),
      completion_per_million: usdPerMillion(m.pricing.completion),
      free: m.free,
      verified: Boolean(m.verified),
      providers: m.endpoints.map((e) => e.adapter),
      metrics_estimated: m.endpoints.some((e) => e.metricsEstimated !== false),
    },
  }));
  return Response.json({ data });
}
