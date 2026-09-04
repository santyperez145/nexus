import {
  isEmbeddingModel,
  parseVariant,
  type CatalogModel,
  type ModelEndpoint,
} from "@/lib/catalog";
import {
  findModelInCatalog,
  resolveModelSlugFromCatalog,
} from "@/lib/catalog/runtime";
import {
  applyVariantSort,
  filterEndpoints,
  sortEndpoints,
} from "./router";
import type { AuthContext, ProviderPreferences } from "./types";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export function normalizeEmbeddingModelId(value: unknown) {
  const raw = String(value ?? DEFAULT_EMBEDDING_MODEL).trim();
  if (!raw) return DEFAULT_EMBEDDING_MODEL;
  if (!raw.includes("/") && /^text-embedding-[a-z0-9.-]+$/i.test(raw)) {
    return `openai/${raw}`;
  }
  return raw;
}

export function resolveEmbeddingRoute(input: {
  model?: unknown;
  catalog: CatalogModel[];
  auth: AuthContext;
  provider?: ProviderPreferences;
}): {
  requested: string;
  model: CatalogModel;
  endpoints: ModelEndpoint[];
} {
  const requested = resolveModelSlugFromCatalog(
    normalizeEmbeddingModelId(input.model),
    input.catalog,
  );
  const { id, variants } = parseVariant(requested);
  const model = findModelInCatalog(id, input.catalog);
  if (!model || model.id.startsWith("nexus/") || !isEmbeddingModel(model)) {
    throw Object.assign(new Error("unsupported embedding model"), {
      status: 400,
      code: "invalid_request",
    });
  }
  const endpoints = sortEndpoints(
    filterEndpoints(model.endpoints, input.provider, input.auth),
    applyVariantSort(variants, input.provider),
    input.provider,
  );
  return { requested, model, endpoints };
}

export function validateEmbeddingResult(input: {
  embeddings: number[][];
  expectedCount: number;
  requestedDimensions?: number;
  reportedTokens: number;
  reservationTokens: number;
}) {
  if (input.embeddings.length !== input.expectedCount || !input.embeddings.length) {
    throw Object.assign(new Error("Embedding provider returned the wrong vector count"), {
      status: 502,
      code: "provider_invalid_response",
    });
  }
  const dimensions = input.embeddings[0]?.length ?? 0;
  const vectorsValid =
    dimensions > 0 &&
    dimensions <= 65_536 &&
    input.embeddings.every(
      (vector) =>
        vector.length === dimensions &&
        vector.every((value) => Number.isFinite(value)),
    );
  if (!vectorsValid || (input.requestedDimensions && dimensions !== input.requestedDimensions)) {
    throw Object.assign(new Error("Embedding provider returned invalid vector dimensions"), {
      status: 502,
      code: "provider_invalid_response",
    });
  }
  const reportedTokensValid =
    Number.isSafeInteger(input.reportedTokens) &&
    input.reportedTokens >= 0 &&
    input.reportedTokens <= input.reservationTokens + input.expectedCount * 16;
  if (!reportedTokensValid) {
    throw Object.assign(new Error("Embedding provider returned invalid token usage"), {
      status: 502,
      code: "provider_invalid_response",
    });
  }
  return {
    dimensions,
    promptTokens: input.reportedTokens > 0 ? input.reportedTokens : input.reservationTokens,
  };
}
