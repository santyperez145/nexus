import { allModels } from "@/lib/catalog";
import { usdPerMillion } from "@/lib/catalog";

export async function GET() {
  const data = allModels().map((m) => ({
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
      providers: m.endpoints.map((e) => e.adapter),
    },
  }));
  return Response.json({ data });
}
