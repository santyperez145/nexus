import { allModels, findModel, parseVariant, usdPerMillion, type CatalogModel, type ModelEndpoint } from "@/lib/catalog";
import type { AuthContext, ChatRequest, ProviderPreferences } from "./types";

export type RoutePlan = {
  requested: string;
  models: Array<{ model: CatalogModel; endpoints: ModelEndpoint[]; variants: string[] }>;
};

function sortEndpoints(
  endpoints: ModelEndpoint[],
  sort: ProviderPreferences["sort"] | "price",
  prefs?: ProviderPreferences,
) {
  const copy = [...endpoints];
  const minTps = prefs?.preferred_min_throughput;
  const maxLat = prefs?.preferred_max_latency != null ? prefs.preferred_max_latency * 1000 : undefined;
  copy.sort((a, b) => {
    if (minTps) {
      const ah = a.throughputTps >= minTps ? 0 : 1;
      const bh = b.throughputTps >= minTps ? 0 : 1;
      if (ah !== bh) return ah - bh;
    }
    if (maxLat) {
      const ah = a.latencyMs <= maxLat ? 0 : 1;
      const bh = b.latencyMs <= maxLat ? 0 : 1;
      if (ah !== bh) return ah - bh;
    }
    if (sort === "throughput") return b.throughputTps - a.throughputTps;
    if (sort === "latency") return a.latencyMs - b.latencyMs;
    return a.pricing.prompt + a.pricing.completion - (b.pricing.prompt + b.pricing.completion);
  });
  return copy;
}

function applyVariantSort(variants: string[], prefs?: ProviderPreferences): ProviderPreferences["sort"] {
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

function filterEndpoints(
  endpoints: ModelEndpoint[],
  prefs: ProviderPreferences | undefined,
  auth: AuthContext,
) {
  let list = endpoints;
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
  if (auth.zdr || prefs?.zdr || prefs?.data_collection === "deny") {
    list = list.filter((e) => e.zdr);
  }
  if (prefs?.order?.length) {
    const ordered = prefs.order
      .map((name) => list.find((e) => e.name === name || e.adapter === name))
      .filter((e): e is ModelEndpoint => Boolean(e));
    const rest = list.filter((e) => !prefs.order!.includes(e.name) && !prefs.order!.includes(e.adapter));
    list = prefs.allow_fallbacks === false ? ordered : [...ordered, ...rest];
  } else if (prefs?.allow_fallbacks === false) {
    list = list.slice(0, 1);
  }
  return list;
}

function pickAuto(prompt: string): CatalogModel[] {
  const catalog = allModels().filter((m) => !m.id.startsWith("nexus/"));
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
  const requested = req.model ?? "nexus/auto";
  const fallbacks = req.models ?? [];
  const slugs = [requested, ...fallbacks];
  const models: RoutePlan["models"] = [];
  const needed = requestParams(req);

  for (const slug of slugs) {
    const { id, variants } = parseVariant(slug);
    if (id === "nexus/auto") {
      const prompt =
        typeof req.messages?.at(-1)?.content === "string"
          ? (req.messages!.at(-1)!.content as string)
          : req.prompt ?? "";
      for (const model of pickAuto(prompt).slice(0, 4)) {
        if (req.provider?.require_parameters && needed.some((p) => !model.supportedParameters.includes(p))) {
          continue;
        }
        const sort = applyVariantSort(variants, req.provider);
        const endpoints = sortEndpoints(
          filterEndpoints(model.endpoints, req.provider, auth),
          sort,
          req.provider,
        );
        if (endpoints.length) models.push({ model, endpoints, variants });
      }
      continue;
    }
    if (id === "nexus/free") {
      for (const model of allModels().filter((m) => m.free && !m.id.startsWith("nexus/"))) {
        const endpoints = filterEndpoints(model.endpoints, req.provider, auth);
        if (endpoints.length) models.push({ model, endpoints, variants: ["free"] });
      }
      continue;
    }
    const model = findModel(id);
    if (!model || model.id.startsWith("nexus/")) continue;
    if (variants.includes("free") && !model.free) continue;
    if (req.provider?.require_parameters && needed.some((p) => !model.supportedParameters.includes(p))) {
      continue;
    }
    const sort = applyVariantSort(variants, req.provider);
    const endpoints = sortEndpoints(filterEndpoints(model.endpoints, req.provider, auth), sort, req.provider);
    if (endpoints.length) models.push({ model, endpoints, variants });
  }

  return { requested, models };
}
