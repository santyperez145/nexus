export type ModelEndpoint = {
  name: string;
  adapter: string;
  providerModel: string;
  pricing: { prompt: number; completion: number };
  /** True only after Nexus has reviewed the retail tariff for this exact provider model. */
  pricingVerified?: boolean;
  /** Explicit zero-cost tariff. Zeroes without this flag are treated as unknown, never free. */
  free?: boolean;
  latencyMs: number;
  throughputTps: number;
  zdr: boolean;
  uptime: number;
  quantization: string;
  /** Curated host (slug/price/ZDR). Does not imply live telemetry. */
  verified?: boolean;
  /** latency/throughput/uptime are unavailable, not measured. */
  metricsEstimated?: boolean;
  /** Durable platform-managed provider binding. Never contains the secret. */
  providerConnectionId?: string;
  providerOfferingId?: string;
  providerSourceHash?: string;
  runtimeProtocol?: "openai" | "anthropic" | "google" | "mistral";
  runtimeBaseUrl?: string;
  /** Contract review results copied into the immutable route candidate. */
  zdrVerified?: boolean;
  noTrainingVerified?: boolean;
};

export type CatalogModel = {
  id: string;
  name: string;
  description: string;
  author: string;
  created: number;
  contextLength: number;
  architecture: {
    modality: string;
    inputModalities: string[];
    outputModalities: string[];
    tokenizer: string;
  };
  pricing: {
    prompt: number;
    completion: number;
    request: number;
    image: number;
    webSearch: number;
    inputCacheRead: number;
    inputCacheWrite: number;
  };
  topProvider: {
    contextLength: number;
    maxCompletionTokens: number;
    isModerated: boolean;
  };
  supportedParameters: string[];
  knowledgeCutoff: string | null;
  huggingFaceId: string | null;
  canonicalSlug: string;
  free: boolean;
  verified?: boolean;
  endpoints: ModelEndpoint[];
};
