import type { CatalogModel } from "./types";

const ADAPTER: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  "x-ai": "xai",
  deepseek: "deepseek",
  mistralai: "mistral",
  "meta-llama": "groq",
  qwen: "groq",
  groq: "groq",
  cohere: "cohere",
  amazon: "amazon",
  perplexity: "perplexity",
  nvidia: "nvidia",
};

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type UpstreamModel = {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  context_length?: number;
  canonical_slug?: string;
  hugging_face_id?: string;
  knowledge_cutoff?: string | null;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
  };
  pricing?: Record<string, string | number>;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  supported_parameters?: string[];
};

export function normalizeUpstream(m: UpstreamModel): CatalogModel {
  const author = m.id.split("/")[0] ?? "unknown";
  const adapter = ADAPTER[author] ?? "openai-compatible";
  const prompt = num(m.pricing?.prompt);
  const completion = num(m.pricing?.completion);
  const free = prompt === 0 && completion === 0;
  return {
    id: m.id,
    name: m.name ?? m.id,
    description: (m.description ?? "").slice(0, 280),
    author,
    created: m.created ?? 0,
    contextLength: m.context_length ?? 128000,
    architecture: {
      modality: m.architecture?.modality ?? "text->text",
      inputModalities: m.architecture?.input_modalities ?? ["text"],
      outputModalities: m.architecture?.output_modalities ?? ["text"],
      tokenizer: m.architecture?.tokenizer ?? "Unknown",
    },
    pricing: {
      prompt,
      completion,
      request: num(m.pricing?.request),
      image: num(m.pricing?.image),
      webSearch: num(m.pricing?.web_search),
      inputCacheRead: num(m.pricing?.input_cache_read),
      inputCacheWrite: num(m.pricing?.input_cache_write),
    },
    topProvider: {
      contextLength: m.top_provider?.context_length ?? m.context_length ?? 128000,
      maxCompletionTokens: m.top_provider?.max_completion_tokens ?? 8192,
      isModerated: Boolean(m.top_provider?.is_moderated),
    },
    supportedParameters: m.supported_parameters ?? [],
    knowledgeCutoff: m.knowledge_cutoff ?? null,
    huggingFaceId: m.hugging_face_id ?? null,
    canonicalSlug: m.canonical_slug ?? m.id,
    free,
    endpoints: [
      {
        name: author,
        adapter,
        providerModel: m.id.split("/").slice(1).join("/").replace(/:free$/, ""),
        pricing: { prompt, completion },
        latencyMs: free ? 900 : 420,
        throughputTps: free ? 40 : 85,
        zdr: false,
        uptime: 0.997,
        quantization: free ? "int4" : "fp8",
      },
    ],
  };
}
