import { isModelExecutionReady } from "@/lib/catalog/presentation";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { scopeAllows } from "@/lib/gateway/acl";
import type { AuthContext } from "@/lib/gateway/types";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";
import { listPublicManagedProviders } from "@/lib/providers/onboarding";
import { listHubCollections } from "./collection-store";
import { listModelRepositories } from "./model-repository-store";
import { listDatasetRepositories } from "./repository-store";
import { listHubSpaces } from "./space-store";

export const hubSearchTypes = ["model", "dataset", "space", "collection", "provider"] as const;
export type HubSearchType = (typeof hubSearchTypes)[number];

export type HubSearchHit = {
  type: HubSearchType;
  path: string;
  title: string;
  description: string;
  href: string;
  scope: "public" | "tenant";
  verified: boolean;
  executable: boolean;
  updated_at: string | null;
  meta: Record<string, string | number | boolean>;
};

export type HubSearchResult = {
  query: string;
  types: HubSearchType[];
  hits: HubSearchHit[];
  counts: Record<HubSearchType, number>;
  degraded: boolean;
};

const SCOPE_BY_TYPE: Record<Exclude<HubSearchType, "provider">, string> = {
  model: "models:read",
  dataset: "datasets:read",
  space: "spaces:read",
  collection: "collections:read",
};

function clip(value: string, max = 240) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function score(hit: HubSearchHit, query: string) {
  const needle = query.toLowerCase();
  const path = hit.path.toLowerCase();
  const title = hit.title.toLowerCase();
  if (!needle) return hit.verified ? 1 : 0;
  let value = 0;
  if (path === needle || title === needle) value += 100;
  if (path.startsWith(needle) || title.startsWith(needle)) value += 40;
  if (path.includes(needle) || title.includes(needle)) value += 20;
  if (hit.verified) value += 6;
  if (hit.executable) value += 4;
  if (hit.scope === "tenant") value += 2;
  return value;
}

/**
 * Private rows are only searchable for identities that can already read them:
 * a browser session, or a management key holding the resource read scope.
 */
export function tenantSearchTypes(auth: AuthContext | null): HubSearchType[] {
  if (!auth || auth.guest) return [];
  if (auth.apiKeyId && !auth.isManagement) return [];
  const scopes = auth.scopes ?? [];
  return (Object.keys(SCOPE_BY_TYPE) as Array<Exclude<HubSearchType, "provider">>).filter(
    (type) => !auth.apiKeyId || scopeAllows(scopes, SCOPE_BY_TYPE[type]),
  );
}

function dedupe(hits: HubSearchHit[]) {
  const seen = new Map<string, HubSearchHit>();
  for (const hit of hits) {
    const key = `${hit.type}:${hit.path}`;
    const previous = seen.get(key);
    if (!previous || (previous.scope === "public" && hit.scope === "tenant")) seen.set(key, hit);
  }
  return [...seen.values()];
}

async function searchCatalogModels(query: string, limit: number): Promise<HubSearchHit[]> {
  const needle = query.toLowerCase();
  const models = await allRuntimeModels();
  return models
    .filter((model) => isModelExecutionReady(model))
    .filter(
      (model) =>
        !needle ||
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle) ||
        model.endpoints.some((endpoint) => endpoint.adapter.toLowerCase().includes(needle)),
    )
    .slice(0, limit)
    .map((model) => ({
      type: "model" as const,
      path: model.id,
      title: model.name,
      description: clip(model.description ?? ""),
      href: `/models/${model.id}`,
      scope: "public" as const,
      verified: Boolean(model.verified),
      executable: true,
      updated_at: null,
      meta: {
        source: "gateway",
        context_length: model.contextLength,
        free: Boolean(model.free),
        providers: model.endpoints.map((endpoint) => endpoint.adapter).join(","),
      },
    }));
}

async function searchProviders(query: string, limit: number): Promise<HubSearchHit[]> {
  const needle = query.toLowerCase();
  const wired = new Set(wiredProviders().map((provider) => provider.id));
  let managed: Awaited<ReturnType<typeof listPublicManagedProviders>> = [];
  try {
    managed = await listPublicManagedProviders();
  } catch {
    managed = [];
  }
  const rows = [
    ...NEXUS_PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      wired: wired.has(provider.id),
      managed: false,
    })),
    ...managed.map((provider) => ({
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      wired: true,
      managed: true,
    })),
  ];
  return rows
    .filter(
      (provider) =>
        !needle ||
        provider.id.toLowerCase().includes(needle) ||
        provider.label.toLowerCase().includes(needle),
    )
    .slice(0, limit)
    .map((provider) => ({
      type: "provider" as const,
      path: provider.id,
      title: provider.label,
      description: `Proveedor ${provider.kind}${provider.wired ? " conectado" : " sin cablear"}`,
      href: `/providers/${provider.id}`,
      scope: "public" as const,
      verified: provider.wired,
      executable: provider.wired,
      updated_at: null,
      meta: { kind: provider.kind, wired: provider.wired, managed: provider.managed },
    }));
}

type ListInput = { auth: AuthContext | null; mine: boolean; query: string; limit: number };

async function searchModelRepositories(input: ListInput): Promise<HubSearchHit[]> {
  const rows = await listModelRepositories(input);
  return rows.map((repository) => ({
    type: "model" as const,
    path: `${repository.namespace}/${repository.slug}`,
    title: repository.title,
    description: clip(repository.description),
    href: `/models/${repository.namespace}/${repository.slug}`,
    scope: repository.visibility === "public" ? ("public" as const) : ("tenant" as const),
    verified: repository.verificationStatus === "verified",
    executable: Boolean(repository.runtimeModelId),
    updated_at: repository.updatedAt.toISOString(),
    meta: {
      source: "hub",
      visibility: repository.visibility,
      gated: repository.gated,
      downloads: repository.downloads,
      license: repository.license,
    },
  }));
}

async function searchDatasets(input: ListInput): Promise<HubSearchHit[]> {
  const rows = await listDatasetRepositories(input);
  return rows.map((repository) => ({
    type: "dataset" as const,
    path: `${repository.namespace}/${repository.slug}`,
    title: repository.title,
    description: clip(repository.description),
    href: `/datasets/${repository.namespace}/${repository.slug}`,
    scope: repository.visibility === "public" ? ("public" as const) : ("tenant" as const),
    verified: repository.namespaceVerified,
    executable: false,
    updated_at: repository.updatedAt.toISOString(),
    meta: {
      visibility: repository.visibility,
      gated: repository.gated,
      downloads: repository.downloads,
      license: repository.license,
    },
  }));
}

async function searchSpaces(input: ListInput): Promise<HubSearchHit[]> {
  const rows = await listHubSpaces(input);
  return rows.map((space) => ({
    type: "space" as const,
    path: `${space.namespace}/${space.slug}`,
    title: space.title,
    description: clip(space.description),
    href: `/spaces/${space.namespace}/${space.slug}`,
    scope: space.visibility === "public" ? ("public" as const) : ("tenant" as const),
    verified: space.namespaceVerified,
    executable: true,
    updated_at: space.updatedAt.toISOString(),
    meta: { visibility: space.visibility, model: space.model },
  }));
}

async function searchCollections(input: ListInput): Promise<HubSearchHit[]> {
  const rows = await listHubCollections(input);
  return rows.map((collection) => ({
    type: "collection" as const,
    path: `${collection.namespace}/${collection.slug}`,
    title: collection.title,
    description: clip(collection.description),
    href: `/collections/${collection.namespace}/${collection.slug}`,
    scope: collection.visibility === "public" ? ("public" as const) : ("tenant" as const),
    verified: collection.namespaceVerified,
    executable: false,
    updated_at: collection.updatedAt.toISOString(),
    meta: { visibility: collection.visibility, theme: collection.theme },
  }));
}

export async function hubSearch(input: {
  auth?: AuthContext | null;
  query: string;
  types?: HubSearchType[];
  limit?: number;
}): Promise<HubSearchResult> {
  const auth = input.auth ?? null;
  const query = input.query.trim().slice(0, 120);
  const limit = Math.max(1, Math.min(input.limit ?? 20, 50));
  const types = input.types?.length ? [...new Set(input.types)] : [...hubSearchTypes];
  const tenantTypes = new Set(tenantSearchTypes(auth));
  const perType = limit;
  let degraded = false;

  async function collect(type: HubSearchType, run: () => Promise<HubSearchHit[]>) {
    if (!types.includes(type)) return [];
    try {
      return await run();
    } catch {
      // Search stays available for the rest of the catalog when a store is degraded.
      degraded = true;
      return [];
    }
  }

  const publicInput: ListInput = { auth: null, mine: false, query, limit: perType };
  const tenantInput = (type: Exclude<HubSearchType, "provider">) =>
    tenantTypes.has(type) ? ({ auth, mine: true, query, limit: perType } as ListInput) : null;

  async function tenantRows(
    type: Exclude<HubSearchType, "provider">,
    run: (input: ListInput) => Promise<HubSearchHit[]>,
  ) {
    const scoped = tenantInput(type);
    return scoped ? run(scoped) : [];
  }

  const [
    catalogModels,
    publicModels,
    tenantModels,
    publicDatasets,
    tenantDatasets,
    publicSpaces,
    tenantSpaces,
    publicCollections,
    tenantCollections,
    providers,
  ] = await Promise.all([
    collect("model", () => searchCatalogModels(query, perType)),
    collect("model", () => searchModelRepositories(publicInput)),
    collect("model", () => tenantRows("model", searchModelRepositories)),
    collect("dataset", () => searchDatasets(publicInput)),
    collect("dataset", () => tenantRows("dataset", searchDatasets)),
    collect("space", () => searchSpaces(publicInput)),
    collect("space", () => tenantRows("space", searchSpaces)),
    collect("collection", () => searchCollections(publicInput)),
    collect("collection", () => tenantRows("collection", searchCollections)),
    collect("provider", () => searchProviders(query, perType)),
  ]);

  const hits = dedupe([
    ...catalogModels,
    ...publicModels,
    ...tenantModels,
    ...publicDatasets,
    ...tenantDatasets,
    ...publicSpaces,
    ...tenantSpaces,
    ...publicCollections,
    ...tenantCollections,
    ...providers,
  ]).sort((a, b) => score(b, query) - score(a, query) || a.path.localeCompare(b.path));

  const counts = Object.fromEntries(
    hubSearchTypes.map((type) => [type, hits.filter((hit) => hit.type === type).length]),
  ) as Record<HubSearchType, number>;

  return { query, types, hits: hits.slice(0, limit * types.length), counts, degraded };
}
