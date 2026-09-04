import type { CatalogModel, ModelEndpoint } from "./types";

type Host = {
  adapter: string;
  providerModel: string;
  prompt?: number;
  completion?: number;
  zdr?: boolean;
  /** Must be explicit because a zero price can also mean unknown. */
  free?: boolean;
  pricingVerified?: boolean;
};

function model(opts: {
  id: string;
  name: string;
  description: string;
  adapter?: string;
  providerModel?: string;
  hosts?: Host[];
  context?: number;
  prompt: number;
  completion: number;
  modalities?: string[];
  outputModalities?: string[];
  request?: number;
  image?: number;
  zdr?: boolean;
  free?: boolean;
  params?: string[];
}): CatalogModel {
  const author = opts.id.split("/")[0] ?? "nexus";
  const inputModalities = opts.modalities ?? ["text"];
  const outputModalities = opts.outputModalities ?? ["text"];
  const usesTokenPricing =
    outputModalities.includes("embeddings") ||
    outputModalities.includes("rerank") ||
    (inputModalities.includes("text") && outputModalities.includes("text"));
  const hosts: Host[] =
    opts.hosts ??
    (opts.adapter && opts.providerModel
      ? [{ adapter: opts.adapter, providerModel: opts.providerModel, zdr: opts.zdr }]
      : []);
  const endpoints: ModelEndpoint[] = hosts.map((h, index) => {
    const prompt = h.prompt ?? opts.prompt;
    const completion = h.completion ?? opts.completion;
    const free = h.free === true || (hosts.length === 1 && opts.free === true);
    return {
      name: h.adapter,
      adapter: h.adapter,
      providerModel: h.providerModel,
      pricing: { prompt, completion },
      // The model-level tariff belongs to the canonical (first) host. Other
      // hosts often charge differently and need an explicit per-host review.
      pricingVerified:
        h.pricingVerified ??
        (usesTokenPricing &&
          (free ||
          ((hosts.length === 1 || index === 0) && (prompt > 0 || completion > 0)) ||
          ((h.prompt != null && h.completion != null) && (prompt > 0 || completion > 0)))),
      free,
      latencyMs: 0,
      throughputTps: 0,
      zdr: h.zdr ?? opts.zdr ?? false,
      uptime: 0,
      quantization: "unknown",
      verified: true,
      metricsEstimated: true,
    };
  });
  const free = endpoints.some((endpoint) => endpoint.free && endpoint.pricingVerified);
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    author,
    created: 1_725_000_000,
    contextLength: opts.context ?? 128000,
    architecture: {
      modality: `${inputModalities.join("+")}->${outputModalities.join("+")}`,
      inputModalities,
      outputModalities,
      tokenizer: author,
    },
    pricing: {
      prompt: opts.prompt,
      completion: opts.completion,
      request: opts.request ?? 0,
      image: opts.image ?? 0,
      webSearch: 0,
      inputCacheRead: 0,
      inputCacheWrite: 0,
    },
    topProvider: {
      contextLength: opts.context ?? 128000,
      maxCompletionTokens: 8192,
      isModerated: opts.zdr ?? false,
    },
    supportedParameters: opts.params ?? ["temperature", "max_tokens", "stream", "tools"],
    knowledgeCutoff: null,
    huggingFaceId: null,
    canonicalSlug: opts.id,
    free,
    verified: true,
    endpoints,
  };
}

const llama70Hosts: Host[] = [
  { adapter: "groq", providerModel: "llama-3.3-70b-versatile" },
  { adapter: "together", providerModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { adapter: "fireworks", providerModel: "accounts/fireworks/models/llama-v3p3-70b-instruct" },
  { adapter: "cerebras", providerModel: "llama-3.3-70b" },
  { adapter: "sambanova", providerModel: "Meta-Llama-3.3-70B-Instruct" },
  { adapter: "deepinfra", providerModel: "meta-llama/Llama-3.3-70B-Instruct" },
  { adapter: "hyperbolic", providerModel: "meta-llama/Llama-3.3-70B-Instruct" },
  { adapter: "novita", providerModel: "meta-llama/llama-3.3-70b-instruct" },
  { adapter: "nebius", providerModel: "meta-llama/Llama-3.3-70B-Instruct" },
  { adapter: "nvidia", providerModel: "meta/llama-3.3-70b-instruct" },
];

const llama8Hosts: Host[] = [
  { adapter: "groq", providerModel: "llama-3.1-8b-instant", prompt: 0, completion: 0, free: true },
  { adapter: "together", providerModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" },
  { adapter: "fireworks", providerModel: "accounts/fireworks/models/llama-v3p1-8b-instruct" },
  { adapter: "cerebras", providerModel: "llama3.1-8b" },
  { adapter: "deepinfra", providerModel: "meta-llama/Meta-Llama-3.1-8B-Instruct" },
  { adapter: "hyperbolic", providerModel: "meta-llama/Meta-Llama-3.1-8B-Instruct" },
];

const mixtralHosts: Host[] = [
  { adapter: "groq", providerModel: "mixtral-8x7b-32768" },
  { adapter: "together", providerModel: "mistralai/Mixtral-8x7B-Instruct-v0.1" },
  { adapter: "fireworks", providerModel: "accounts/fireworks/models/mixtral-8x7b-instruct" },
  { adapter: "deepinfra", providerModel: "mistralai/Mixtral-8x7B-Instruct-v0.1" },
];

const qwen72Hosts: Host[] = [
  { adapter: "together", providerModel: "Qwen/Qwen2.5-72B-Instruct-Turbo" },
  { adapter: "fireworks", providerModel: "accounts/fireworks/models/qwen2p5-72b-instruct" },
  { adapter: "deepinfra", providerModel: "Qwen/Qwen2.5-72B-Instruct" },
  { adapter: "hyperbolic", providerModel: "Qwen/Qwen2.5-72B-Instruct" },
  { adapter: "novita", providerModel: "qwen/qwen-2.5-72b-instruct" },
  { adapter: "qwen", providerModel: "qwen-plus" },
];

const deepseekChatHosts: Host[] = [
  { adapter: "deepseek", providerModel: "deepseek-chat" },
  { adapter: "together", providerModel: "deepseek-ai/DeepSeek-V3" },
  { adapter: "fireworks", providerModel: "accounts/fireworks/models/deepseek-v3" },
  { adapter: "deepinfra", providerModel: "deepseek-ai/DeepSeek-V3" },
  { adapter: "novita", providerModel: "deepseek/deepseek-v3-0324" },
];

const deepseekR1Hosts: Host[] = [
  { adapter: "deepseek", providerModel: "deepseek-reasoner" },
  { adapter: "together", providerModel: "deepseek-ai/DeepSeek-R1" },
  { adapter: "fireworks", providerModel: "accounts/fireworks/models/deepseek-r1" },
  { adapter: "groq", providerModel: "deepseek-r1-distill-llama-70b" },
];

/** Catálogo propio. Un slug, varios labs (como OpenRouter). Precios de lista por token. */
export const OWNED_CATALOG: CatalogModel[] = [
  model({
    id: "openai/gpt-5",
    name: "GPT-5",
    description: "Modelo de propósito general de OpenAI.",
    hosts: [
      { adapter: "openai", providerModel: "gpt-5", zdr: true },
      { adapter: "azure", providerModel: "gpt-5", zdr: true },
    ],
    context: 400000,
    prompt: 1.25e-6,
    completion: 1e-5,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    description: "Versión rápida y económica de GPT-5.",
    hosts: [
      { adapter: "openai", providerModel: "gpt-5-mini", zdr: true },
      { adapter: "azure", providerModel: "gpt-5-mini", zdr: true },
    ],
    context: 400000,
    prompt: 2.5e-7,
    completion: 2e-6,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "openai/gpt-5-nano",
    name: "GPT-5 Nano",
    description: "Latencia mínima para clasificación y routing.",
    adapter: "openai",
    providerModel: "gpt-5-nano",
    prompt: 5e-8,
    completion: 4e-7,
    zdr: true,
  }),
  model({
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    description: "GPT-4.1 de OpenAI.",
    adapter: "openai",
    providerModel: "gpt-4.1",
    context: 1047576,
    prompt: 2e-6,
    completion: 8e-6,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "openai/gpt-4o",
    name: "GPT-4o",
    description: "Multimodal estable de OpenAI.",
    hosts: [
      { adapter: "openai", providerModel: "gpt-4o", zdr: true },
      { adapter: "azure", providerModel: "gpt-4o", zdr: true },
    ],
    prompt: 2.5e-6,
    completion: 1e-5,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Barato y sólido para volumen.",
    hosts: [
      { adapter: "openai", providerModel: "gpt-4o-mini", zdr: true },
      { adapter: "azure", providerModel: "gpt-4o-mini", zdr: true },
    ],
    prompt: 1.5e-7,
    completion: 6e-7,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "openai/o4-mini",
    name: "o4 Mini",
    description: "Razonamiento compacto de OpenAI.",
    adapter: "openai",
    providerModel: "o4-mini",
    prompt: 1.1e-6,
    completion: 4.4e-6,
    zdr: true,
  }),
  model({
    id: "openai/text-embedding-3-small",
    name: "Embedding 3 Small",
    description: "Embeddings económicos de OpenAI.",
    adapter: "openai",
    providerModel: "text-embedding-3-small",
    prompt: 2e-8,
    completion: 0,
    outputModalities: ["embeddings"],
    params: [],
  }),
  model({
    id: "openai/text-embedding-3-large",
    name: "Embedding 3 Large",
    description: "Embeddings de OpenAI.",
    adapter: "openai",
    providerModel: "text-embedding-3-large",
    prompt: 1.3e-7,
    completion: 0,
    outputModalities: ["embeddings"],
    params: [],
  }),
  model({
    id: "nexus/rerank-fast",
    name: "Nexus Rerank Fast",
    description: "Reranking multilingüe de baja latencia servido por Voyage Rerank 2.5 Lite.",
    adapter: "voyage",
    providerModel: "rerank-2.5-lite",
    prompt: 2e-8,
    completion: 0,
    context: 32_000,
    outputModalities: ["rerank"],
    params: ["top_n", "return_documents", "truncation", "provider"],
  }),
  model({
    id: "nexus/rerank-quality",
    name: "Nexus Rerank Quality",
    description: "Reranking multilingüe de mayor precisión servido por Voyage Rerank 2.5.",
    adapter: "voyage",
    providerModel: "rerank-2.5",
    prompt: 5e-8,
    completion: 0,
    context: 32_000,
    outputModalities: ["rerank"],
    params: ["top_n", "return_documents", "truncation", "provider"],
  }),
  model({
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    description: "Coding y agentes. Precio de lista de Anthropic.",
    hosts: [
      { adapter: "anthropic", providerModel: "claude-sonnet-4-6", zdr: true },
      { adapter: "amazon", providerModel: "anthropic.claude-sonnet-4-6", zdr: true },
      { adapter: "google-vertex", providerModel: "claude-sonnet-4-6", zdr: true },
    ],
    context: 1000000,
    prompt: 3e-6,
    completion: 1.5e-5,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    description: "Tope de calidad de Anthropic.",
    hosts: [
      { adapter: "anthropic", providerModel: "claude-opus-4-6", zdr: true },
      { adapter: "amazon", providerModel: "anthropic.claude-opus-4-6", zdr: true },
      { adapter: "google-vertex", providerModel: "claude-opus-4-6", zdr: true },
    ],
    context: 1000000,
    prompt: 1.5e-5,
    completion: 7.5e-5,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    description: "Rápido y económico de Anthropic.",
    hosts: [
      { adapter: "anthropic", providerModel: "claude-haiku-4-5", zdr: true },
      { adapter: "amazon", providerModel: "anthropic.claude-haiku-4-5", zdr: true },
    ],
    prompt: 8e-7,
    completion: 4e-6,
    zdr: true,
  }),
  model({
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Modelo Pro de Google.",
    hosts: [
      { adapter: "google", providerModel: "gemini-2.5-pro", zdr: true },
      { adapter: "google-vertex", providerModel: "gemini-2.5-pro", zdr: true },
    ],
    context: 1000000,
    prompt: 1.25e-6,
    completion: 1e-5,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Alto throughput de Google.",
    hosts: [
      { adapter: "google", providerModel: "gemini-2.5-flash", zdr: true },
      { adapter: "google-vertex", providerModel: "gemini-2.5-flash", zdr: true },
    ],
    context: 1000000,
    prompt: 3e-7,
    completion: 2.5e-6,
    modalities: ["text", "image"],
    zdr: true,
  }),
  model({
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    description: "Capa económica de Gemini.",
    adapter: "google",
    providerModel: "gemini-2.5-flash-lite",
    prompt: 1e-7,
    completion: 4e-7,
    zdr: true,
  }),
  model({
    id: "google/gemma-2-9b-it",
    name: "Gemma 2 9B",
    description: "Gemma 2 en Groq y otros hosts OpenAI-compat.",
    prompt: 0,
    completion: 0,
    free: true,
    hosts: [
      { adapter: "groq", providerModel: "gemma2-9b-it", prompt: 0, completion: 0, free: true },
      { adapter: "together", providerModel: "google/gemma-2-9b-it" },
      { adapter: "fireworks", providerModel: "accounts/fireworks/models/gemma2-9b-it" },
    ],
  }),
  model({
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    description: "DeepSeek V3. Rutea al lab nativo o a hosts OpenAI-compat.",
    prompt: 2.7e-7,
    completion: 1.1e-6,
    hosts: deepseekChatHosts,
  }),
  model({
    id: "deepseek/deepseek-r1",
    name: "DeepSeek R1",
    description: "Razonamiento de DeepSeek, con fallbacks en Groq/Together/Fireworks.",
    prompt: 5.5e-7,
    completion: 2.19e-6,
    hosts: deepseekR1Hosts,
  }),
  model({
    id: "mistralai/mistral-large",
    name: "Mistral Large",
    description: "Flagship de Mistral.",
    adapter: "mistral",
    providerModel: "mistral-large-latest",
    prompt: 2e-6,
    completion: 6e-6,
  }),
  model({
    id: "mistralai/mistral-small",
    name: "Mistral Small",
    description: "Volumen y latencia de Mistral.",
    adapter: "mistral",
    providerModel: "mistral-small-latest",
    prompt: 1e-7,
    completion: 3e-7,
  }),
  model({
    id: "mistralai/mixtral-8x7b-instruct",
    name: "Mixtral 8x7B",
    description: "Mixtral en Groq, Together, Fireworks y DeepInfra.",
    prompt: 2.4e-7,
    completion: 2.4e-7,
    hosts: mixtralHosts,
  }),
  model({
    id: "x-ai/grok-3",
    name: "Grok 3",
    description: "Modelo Grok de xAI.",
    adapter: "xai",
    providerModel: "grok-3",
    prompt: 3e-6,
    completion: 1.5e-5,
  }),
  model({
    id: "x-ai/grok-4",
    name: "Grok 4",
    description: "Grok 4 de xAI.",
    adapter: "xai",
    providerModel: "grok-4",
    prompt: 3e-6,
    completion: 1.5e-5,
  }),
  model({
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    description: "Llama 3.3 70B. Un slug, diez labs.",
    prompt: 5.9e-7,
    completion: 7.9e-7,
    hosts: llama70Hosts,
  }),
  model({
    id: "meta-llama/llama-3.1-8b-instruct",
    name: "Llama 3.1 8B",
    description: "Llama 3.1 8B. Groq suele ir en $0.",
    prompt: 0,
    completion: 0,
    free: true,
    hosts: llama8Hosts,
  }),
  model({
    id: "groq/llama-3.3-70b",
    name: "Llama 3.3 70B (Groq)",
    description: "Alias directo al host Groq.",
    adapter: "groq",
    providerModel: "llama-3.3-70b-versatile",
    prompt: 5.9e-7,
    completion: 7.9e-7,
  }),
  model({
    id: "groq/llama-3.1-8b",
    name: "Llama 3.1 8B (Groq)",
    description: "Alias directo al host Groq.",
    adapter: "groq",
    providerModel: "llama-3.1-8b-instant",
    prompt: 0,
    completion: 0,
    free: true,
  }),
  model({
    id: "qwen/qwen2.5-72b-instruct",
    name: "Qwen2.5 72B",
    description: "Qwen en Together, Fireworks, DeepInfra, Novita y Dashscope.",
    prompt: 4e-7,
    completion: 1.2e-6,
    hosts: qwen72Hosts,
  }),
  model({
    id: "qwen/qwen-plus",
    name: "Qwen Plus",
    description: "Qwen Plus vía Dashscope compatible-mode.",
    adapter: "qwen",
    providerModel: "qwen-plus",
    prompt: 8e-7,
    completion: 2e-6,
  }),
  model({
    id: "moonshotai/kimi-k2",
    name: "Kimi K2",
    description: "Kimi de Moonshot.",
    adapter: "moonshot",
    providerModel: "kimi-k2-0905-preview",
    prompt: 6e-7,
    completion: 2.5e-6,
  }),
  model({
    id: "minimax/minimax-m1",
    name: "MiniMax M1",
    description: "MiniMax M1.",
    adapter: "minimax",
    providerModel: "MiniMax-M1",
    prompt: 4e-7,
    completion: 2.2e-6,
  }),
  model({
    id: "cohere/command-a",
    name: "Command A",
    description: "Command A de Cohere (OpenAI-compat).",
    adapter: "cohere",
    providerModel: "command-a-03-2025",
    prompt: 2.5e-6,
    completion: 1e-5,
  }),
  model({
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    name: "Llama Nemotron 70B",
    description: "Nemotron en NVIDIA NIM.",
    adapter: "nvidia",
    providerModel: "nvidia/llama-3.1-nemotron-70b-instruct",
    prompt: 3.5e-7,
    completion: 1.2e-6,
  }),
  model({
    id: "perplexity/sonar",
    name: "Sonar",
    description: "Búsqueda + generación de Perplexity.",
    adapter: "perplexity",
    providerModel: "sonar",
    prompt: 1e-6,
    completion: 1e-6,
  }),
  model({
    id: "perplexity/sonar-pro",
    name: "Sonar Pro",
    description: "Sonar con más contexto de Perplexity.",
    adapter: "perplexity",
    providerModel: "sonar-pro",
    prompt: 3e-6,
    completion: 1.5e-5,
  }),
  model({
    id: "ai21/jamba-mini",
    name: "Jamba Mini",
    description: "Jamba Mini de AI21.",
    adapter: "ai21",
    providerModel: "jamba-mini",
    prompt: 2e-7,
    completion: 4e-7,
  }),
  model({
    id: "openai/gpt-image-2",
    name: "GPT Image 2",
    description: "Generación y edición de imágenes de última generación.",
    adapter: "openai",
    providerModel: "gpt-image-2",
    prompt: 0,
    completion: 0,
    image: 0.034,
    outputModalities: ["image"],
    params: ["prompt", "quality", "size", "n"],
  }),
  model({
    id: "openai/gpt-image-1.5",
    name: "GPT Image 1.5",
    description: "Modelo visual anterior con alta fidelidad.",
    adapter: "openai",
    providerModel: "gpt-image-1.5",
    prompt: 0,
    completion: 0,
    image: 0.034,
    outputModalities: ["image"],
    params: ["prompt", "quality", "size", "n"],
  }),
  model({
    id: "openai/gpt-image-1-mini",
    name: "GPT Image 1 Mini",
    description: "Generación visual económica para alto volumen.",
    adapter: "openai",
    providerModel: "gpt-image-1-mini",
    prompt: 0,
    completion: 0,
    image: 0.011,
    outputModalities: ["image"],
    params: ["prompt", "quality", "size", "n"],
  }),
  model({
    id: "openai/gpt-image-1",
    name: "GPT Image 1",
    description: "Generación de imágenes de OpenAI.",
    adapter: "openai",
    providerModel: "gpt-image-1",
    prompt: 0,
    completion: 0,
    image: 0.042,
    outputModalities: ["image"],
    params: ["prompt", "quality", "size", "n"],
  }),
  model({
    id: "openai/gpt-4o-mini-tts",
    name: "GPT-4o Mini TTS",
    description: "Voz natural controlable a partir de texto.",
    adapter: "openai",
    providerModel: "gpt-4o-mini-tts",
    prompt: 6e-7,
    completion: 1.2e-5,
    outputModalities: ["audio"],
    params: ["voice", "instructions", "response_format", "speed"],
  }),
  model({
    id: "openai/tts-1",
    name: "TTS 1",
    description: "Text-to-speech de OpenAI.",
    adapter: "openai",
    providerModel: "tts-1",
    prompt: 1.5e-5,
    completion: 0,
    outputModalities: ["audio"],
    params: ["voice", "response_format", "speed"],
  }),
  model({
    id: "openai/tts-1-hd",
    name: "TTS 1 HD",
    description: "Texto a voz de alta calidad.",
    adapter: "openai",
    providerModel: "tts-1-hd",
    prompt: 3e-5,
    completion: 0,
    outputModalities: ["audio"],
    params: ["voice", "response_format", "speed"],
  }),
  model({
    id: "openai/gpt-transcribe",
    name: "GPT Transcribe",
    description: "Transcripción de audio de alta precisión.",
    adapter: "openai",
    providerModel: "gpt-transcribe",
    prompt: 4.5e-6,
    completion: 0,
    modalities: ["audio"],
    params: [],
  }),
  model({
    id: "openai/gpt-4o-transcribe",
    name: "GPT-4o Transcribe",
    description: "Transcripción de audio con reconocimiento avanzado.",
    adapter: "openai",
    providerModel: "gpt-4o-transcribe",
    prompt: 2.5e-6,
    completion: 1e-5,
    modalities: ["audio"],
    params: [],
  }),
  model({
    id: "openai/gpt-4o-mini-transcribe",
    name: "GPT-4o Mini Transcribe",
    description: "Transcripción rápida y económica.",
    adapter: "openai",
    providerModel: "gpt-4o-mini-transcribe",
    prompt: 1.25e-6,
    completion: 5e-6,
    modalities: ["audio"],
    params: [],
  }),
  model({
    id: "openai/whisper-1",
    name: "Whisper",
    description: "Speech-to-text de OpenAI.",
    adapter: "openai",
    providerModel: "whisper-1",
    prompt: 6e-6,
    completion: 0,
    modalities: ["audio"],
    params: [],
  }),
];
