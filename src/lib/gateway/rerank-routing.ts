import {
  isRerankModel,
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

export function resolveRerankRoute(input: {
  model: unknown;
  catalog: CatalogModel[];
  auth: AuthContext;
  provider?: ProviderPreferences;
}): {
  requested: string;
  model: CatalogModel;
  endpoints: ModelEndpoint[];
} {
  const raw = String(input.model ?? "").trim();
  if (!raw) {
    throw Object.assign(new Error("model is required"), {
      status: 400,
      code: "invalid_request",
    });
  }
  const requested = resolveModelSlugFromCatalog(raw, input.catalog);
  const { id, variants } = parseVariant(requested);
  const model = findModelInCatalog(id, input.catalog);
  if (!model || !isRerankModel(model)) {
    throw Object.assign(new Error("unsupported rerank model"), {
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

export function validateRerankResult(input: {
  results: unknown;
  documentCount: number;
  maxResults: number;
  reportedTokens: unknown;
  reservationTokens: number;
}) {
  if (!Array.isArray(input.results) || !input.results.length || input.results.length > input.maxResults) {
    throw Object.assign(new Error("Rerank provider returned an invalid result count"), {
      status: 502,
      code: "provider_invalid_response",
    });
  }
  const seen = new Set<number>();
  const results = input.results.map((value) => {
    if (!value || typeof value !== "object") {
      throw Object.assign(new Error("Rerank provider returned an invalid result"), {
        status: 502,
        code: "provider_invalid_response",
      });
    }
    const row = value as { index?: unknown; relevance_score?: unknown; score?: unknown };
    const index = Number(row.index);
    const relevanceScore = Number(row.relevance_score ?? row.score);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= input.documentCount ||
      seen.has(index) ||
      !Number.isFinite(relevanceScore) ||
      relevanceScore < 0 ||
      relevanceScore > 1
    ) {
      throw Object.assign(new Error("Rerank provider returned invalid indices or scores"), {
        status: 502,
        code: "provider_invalid_response",
      });
    }
    seen.add(index);
    return { index, relevance_score: relevanceScore };
  });
  const reportedTokens = Number(input.reportedTokens);
  if (
    !Number.isSafeInteger(reportedTokens) ||
    reportedTokens < 1 ||
    reportedTokens > input.reservationTokens + input.documentCount * 16
  ) {
    throw Object.assign(new Error("Rerank provider returned invalid token usage"), {
      status: 502,
      code: "provider_invalid_response",
    });
  }
  results.sort((left, right) => right.relevance_score - left.relevance_score || left.index - right.index);
  return { results, promptTokens: reportedTokens };
}
