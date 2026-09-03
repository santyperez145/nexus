import type { CatalogModel } from "./types";
import { OWNED_CATALOG } from "./owned";
import full from "./full.json";

export function bundledModels(): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const m of full as CatalogModel[]) byId.set(m.id, m);
  for (const m of OWNED_CATALOG) byId.set(m.id, m);
  return [...byId.values()];
}
