import type { CatalogModel } from "./types";
import { OWNED_CATALOG } from "./owned";
import full from "./full.json";

export function bundledModels(): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const row of full as CatalogModel[]) {
    const m: CatalogModel = {
      ...row,
      // Reference feeds are useful for discovery, but cannot declare a model
      // executable or free without a reviewed provider-specific tariff.
      free: false,
      verified: false,
      endpoints: row.endpoints.map((endpoint) => ({
        ...endpoint,
        pricingVerified: false,
        free: false,
        latencyMs: 0,
        throughputTps: 0,
        zdr: false,
        uptime: 0,
        quantization: "unknown",
        verified: false,
        metricsEstimated: true,
      })),
    };
    byId.set(m.id, m);
  }
  for (const m of OWNED_CATALOG) byId.set(m.id, m);
  return [...byId.values()];
}
