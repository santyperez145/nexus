import {
  allModels,
  isExecutableEndpoint,
  isFreeEndpoint,
  isTextGenerationModel,
  parseVariant,
  usdPerMillion,
  type CatalogModel,
  type ModelEndpoint,
} from "@/lib/catalog";
import {
  allRuntimeModels,
  findModelInCatalog,
  resolveModelSlugFromCatalog,
} from "@/lib/catalog/runtime";
import type { AuthContext, ChatRequest, ProviderPreferences } from "./types";
import {
  isEndpointNoTrainingConfirmed,
  isEndpointZdrConfirmed,
} from "@/lib/providers/privacy";

export type RoutePlan = {
  requested: string;
  models: Array<{ model: CatalogModel; endpoints: ModelEndpoint[]; variants: string[] }>;
};

export function sortEndpoints(
  endpoints: ModelEndpoint[],
  sort: ProviderPreferences["sort"] | "price",
  prefs?: ProviderPreferences,
) {
  const copy = [...endpoints];
  const minTps = prefs?.preferred_min_throughput;
  const maxLat = prefs?.preferred_max_latency != null ? prefs.preferred_max_latency * 1000 : undefined;
  const order = new Map((prefs?.order ?? []).map((provider, index) => [provider, index]));
  const orderRank = (endpoint: ModelEndpoint) =>
    Math.min(
      order.get(endpoint.name) ?? Number.POSITIVE_INFINITY,
      order.get(endpoint.adapter) ?? Number.POSITIVE_INFINITY,
    );
  copy.sort((a, b) => {
    const aOrder = orderRank(a);
    const bOrder = orderRank(b);
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (minTps) {
      const ah = a.throughputTps > 0 && a.throughputTps >= minTps ? 0 : 1;
      const bh = b.throughputTps > 0 && b.throughputTps >= minTps ? 0 : 1;
      if (ah !== bh) return ah - bh;
    }
    if (maxLat) {
      const ah = a.latencyMs > 0 && a.latencyMs <= maxLat ? 0 : 1;
      const bh = b.latencyMs > 0 && b.latencyMs <= maxLat ? 0 : 1;
      if (ah !== bh) return ah - bh;
    }
    if (sort === "throughput") {
      const at = a.throughputTps || -1;
      const bt = b.throughputTps || -1;
      return bt - at;
    }
    if (sort === "latency") {
      const al = a.latencyMs || Number.POSITIVE_INFINITY;
      const bl = b.latencyMs || Number.POSITIVE_INFINITY;
      if (al === bl) {
        return a.pricing.prompt + a.pricing.completion - (b.pricing.prompt + b.pricing.completion);
      }
      return al - bl;
    }
    return a.pricing.prompt + a.pricing.completion - (b.pricing.prompt + b.pricing.completion);
  });
  return prefs?.allow_fallbacks === false ? copy.slice(0, 1) : copy;
}

export function applyVariantSort(variants: string[], prefs?: ProviderPreferences): ProviderPreferences["sort"] {
  if (variants.includes("fast") || variants.includes("nitro")) return "throughput";
  if (variants.includes("cheap") || variants.includes("floor")) return "price";
  if (variants.includes("quality") || variants.includes("exacto")) return "throughput";
  return prefs?.sort ?? "price";
}

function requestParams(req: ChatRequest) {
  const params: string[] = [];
  if (req.tools) params.push("tools");
  if (req.response_format) params.push("response_format");
  if (req.stream) params.push("stream");
  return params;
}

export function filterEndpoints(
  endpoints: ModelEndpoint[],
  prefs: ProviderPreferences | undefined,
  auth: AuthContext,
) {
  // Discovery and billing trust are separate. A visible endpoint with an
  // unknown tariff cannot enter a route plan.
  let list = endpoints.filter(isExecutableEndpoint);
  if (prefs?.ignore?.length) list = list.filter((e) => !prefs.ignore!.includes(e.name) && !prefs.ignore!.includes(e.adapter));
  if (prefs?.only?.length) list = list.filter((e) => prefs.only!.includes(e.name) || prefs.only!.includes(e.adapter));
  if (prefs?.quantizations?.length) {
    list = list.filter((e) => prefs.quantizations!.includes(e.quantization));
  }
  if (prefs?.max_price) {
    const cap = prefs.max_price;
    list = list.filter((e) => {
      if (cap.prompt != null && usdPerMillion(e.pricing.prompt) > cap.prompt) return false;
      if (cap.completion != null && usdPerMillion(e.pricing.completion) > cap.completion) return false;
      return true;
    });
  }
  if (!auth.guest) {
    if (auth.zdr || prefs?.zdr || prefs?.data_collection === "deny") {
      list = list.filter(isEndpointZdrConfirmed);
    }
    if (!auth.allowTraining) {
      list = list.filter(isEndpointNoTrainingConfirmed);
    }
  }
  if (prefs?.order?.length && prefs.allow_fallbacks === false) {
    list = list.filter(
      (endpoint) => prefs.order!.includes(endpoint.name) || prefs.order!.includes(endpoint.adapter),
    );
  }
  return list;
}

function pickAuto(prompt: string, models: CatalogModel[]): CatalogModel[] {
  const catalog = models.filter(
    (model) => !model.id.startsWith("nexus/") && isTextGenerationModel(model),
  );
  const length = prompt.length;
  const looksCode = /```|function |def |import |class |SELECT /i.test(prompt);
  if (looksCode) {
    return catalog.filter((m) =>
      /claude|gpt-5|codestral|gemini-2.5-pro|deepseek/i.test(m.id),
    );
  }
  if (length < 240) {
    return catalog.filter((m) => m.free || /mini|flash|haiku|nano|small/i.test(m.id));
  }
  return catalog.filter((m) => /sonnet|gpt-5$|gemini-2.5-pro|opus/i.test(m.id));
}

export function resolveRoute(req: ChatRequest, auth: AuthContext): RoutePlan {
  return resolveRouteFromCatalog(req, auth, allModels());
}

export function resolveRouteFromCatalog(
  req: ChatRequest,
  auth: AuthContext,
  catalog: CatalogModel[],
): RoutePlan {
  const requested = resolveModelSlugFromCatalog(req.model ?? "nexus/auto", catalog);
  const fallbacks = (req.models ?? []).map((slug) =>
    resolveModelSlugFromCatalog(slug, catalog),
  );
  const slugs = [requested, ...fallbacks];
  const models: RoutePlan["models"] = [];
  const needed = requestParams(req);

  for (const slug of slugs) {
    const { id, variants } = parseVariant(slug);
    if (id === "nexus/free") {
      for (const model of catalog.filter(
        (candidate) =>
          candidate.free &&
          !candidate.id.startsWith("nexus/") &&
          isTextGenerationModel(candidate),
      )) {
        const endpoints = filterEndpoints(model.endpoints, req.provider, auth).filter(isFreeEndpoint);
        if (endpoints.length) models.push({ model, endpoints, variants: ["free"] });
      }
      continue;
    }
    if (
      id === "nexus/auto" ||
      id === "nexus/auto-beta" ||
      id === "nexus/fusion" ||
      id === "nexus/pareto-code" ||
      id === "nexus/bodybuilder"
    ) {
      const prompt =
        typeof req.messages?.at(-1)?.content === "string"
          ? (req.messages!.at(-1)!.content as string)
          : req.prompt ?? "";
      let added = 0;
      for (const model of pickAuto(prompt, catalog)) {
        if (req.provider?.require_parameters && needed.some((p) => !model.supportedParameters.includes(p))) {
          continue;
        }
        const sort = applyVariantSort(variants, req.provider);
        const endpoints = sortEndpoints(
          filterEndpoints(model.endpoints, req.provider, auth).filter((endpoint) =>
            variants.includes("free") ? isFreeEndpoint(endpoint) : true,
          ),
          sort,
          req.provider,
        );
        if (endpoints.length) {
          models.push({ model, endpoints, variants });
          added += 1;
          if (added >= 4) break;
        }
      }
      continue;
    }
    const model = findModelInCatalog(id, catalog);
    if (!model || model.id.startsWith("nexus/") || !isTextGenerationModel(model)) continue;
    if (variants.includes("free") && !model.free) continue;
    if (req.provider?.require_parameters && needed.some((p) => !model.supportedParameters.includes(p))) {
      continue;
    }
    const sort = applyVariantSort(variants, req.provider);
    const endpoints = sortEndpoints(
      filterEndpoints(model.endpoints, req.provider, auth).filter((endpoint) =>
        variants.includes("free") ? isFreeEndpoint(endpoint) : true,
      ),
      sort,
      req.provider,
    );
    if (endpoints.length) models.push({ model, endpoints, variants });
  }

  return { requested, models };
}

export async function resolveRuntimeRoute(req: ChatRequest, auth: AuthContext) {
  return resolveRouteFromCatalog(req, auth, await allRuntimeModels());
}
