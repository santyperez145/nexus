import { persistCatalog } from "./store";
import { discoverOfficialCatalog } from "./discover";
import { OWNED_CATALOG } from "./owned";
import type { CatalogModel } from "./types";

function isCatalogModel(value: unknown): value is CatalogModel {
  if (!value || typeof value !== "object") return false;
  const m = value as CatalogModel;
  return Boolean(m.id && m.name && Array.isArray(m.endpoints));
}

export async function syncCatalog() {
  const discovered = await discoverOfficialCatalog();
  const byId = new Map<string, CatalogModel>();
  for (const m of discovered.length ? discovered : OWNED_CATALOG) byId.set(m.id, m);

  const custom = process.env.CATALOG_FEED_URL;
  if (custom) {
    const res = await fetch(custom, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Catalog feed failed: ${res.status}`);
    const json = (await res.json()) as { data?: unknown[] };
    if (!Array.isArray(json.data)) throw new Error("Feed must return { data: Model[] }");
    for (const item of json.data) {
      if (isCatalogModel(item)) byId.set(item.id, item);
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
