import type { CatalogModel } from "./types";
import { OWNED_CATALOG } from "./owned";
import full from "./full.json";

export function bundledModels(): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const row of full as CatalogModel[]) {
    const m: CatalogModel = {
      ...row,
      free:
        row.pricing.prompt === 0 &&
        row.pricing.completion === 0 &&
        row.pricing.request === 0 &&
        row.pricing.image === 0,
      verified: false,
      endpoints: row.endpoints.map((endpoint) => ({
        ...endpoint,
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
