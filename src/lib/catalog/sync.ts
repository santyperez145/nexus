import { persistCatalog } from "./store";
import { discoverOfficialCatalog } from "./discover";
import { OWNED_CATALOG } from "./owned";
import type { CatalogModel } from "./types";
import { fetchPublicUrl, readResponseJsonLimited } from "@/lib/net/public-url";

function isCatalogModel(value: unknown): value is CatalogModel {
  if (!value || typeof value !== "object") return false;
  const m = value as CatalogModel;
  return Boolean(
    typeof m.id === "string" &&
      m.id.length > 2 &&
      m.id.length <= 200 &&
      typeof m.name === "string" &&
      m.name.length > 0 &&
      m.name.length <= 300 &&
      m.architecture &&
      Array.isArray(m.architecture.inputModalities) &&
      Array.isArray(m.architecture.outputModalities) &&
      m.pricing &&
      Number.isFinite(m.pricing.prompt) &&
      Number.isFinite(m.pricing.completion) &&
      m.pricing.prompt >= 0 &&
      m.pricing.completion >= 0 &&
      Array.isArray(m.endpoints) &&
      m.endpoints.length <= 100 &&
      m.endpoints.every(
        (endpoint) =>
          typeof endpoint.adapter === "string" &&
          typeof endpoint.providerModel === "string" &&
          Number.isFinite(endpoint.pricing?.prompt) &&
          Number.isFinite(endpoint.pricing?.completion) &&
          endpoint.pricing.prompt >= 0 &&
          endpoint.pricing.completion >= 0,
      )
  );
}

/** External feeds are discovery-only. They cannot self-attest billable prices. */
function quarantineFeedModel(model: CatalogModel): CatalogModel {
  return {
    ...model,
    free: false,
    verified: false,
    endpoints: model.endpoints.map((endpoint) => ({
      ...endpoint,
      pricingVerified: false,
      free: false,
      verified: false,
      metricsEstimated: true,
    })),
  };
}

export async function syncCatalog() {
  const discovered = await discoverOfficialCatalog();
  const byId = new Map<string, CatalogModel>();
  for (const m of discovered.length ? discovered : OWNED_CATALOG) byId.set(m.id, m);

  const custom = process.env.CATALOG_FEED_URL;
  if (custom) {
    const res = await fetchPublicUrl(custom, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Catalog feed failed: ${res.status}`);
    const json = await readResponseJsonLimited<{ data?: unknown[] }>(res, 5_000_000);
    if (!Array.isArray(json.data)) throw new Error("Feed must return { data: Model[] }");
    if (json.data.length > 5_000) throw new Error("Catalog feed exceeds 5000 models");
    for (const item of json.data) {
      if (isCatalogModel(item) && !byId.has(item.id)) {
        byId.set(item.id, quarantineFeedModel(item));
      }
    }
  }

  const final = [...byId.values()];
  await persistCatalog(final);
  return {
    count: final.length,
    source: custom ? "custom-feed+official-providers" : "nexus-owned+official-providers",
    fetchedAt: new Date().toISOString(),
  };
}
