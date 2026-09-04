import { allModels, parseVariant } from "./index";
import type { CatalogModel } from "./types";
import { loadManagedProviderModels } from "@/lib/providers/onboarding";

export function mergeRuntimeCatalog(base: CatalogModel[], managed: CatalogModel[]) {
  const merged = new Map<string, CatalogModel>();
  for (const model of base) {
    merged.set(model.id, {
      ...model,
      architecture: { ...model.architecture },
      pricing: { ...model.pricing },
      topProvider: { ...model.topProvider },
      supportedParameters: [...model.supportedParameters],
      endpoints: [...model.endpoints],
    });
  }
  for (const incoming of managed) {
    const current = merged.get(incoming.id);
    if (!current) {
      merged.set(incoming.id, incoming);
      continue;
    }
    const endpointKeys = new Set(
      current.endpoints.map((endpoint) =>
        endpoint.providerOfferingId
          ? `managed:${endpoint.providerOfferingId}`
          : `static:${endpoint.adapter}:${endpoint.providerModel}`,
      ),
    );
    for (const endpoint of incoming.endpoints) {
      const key = endpoint.providerOfferingId
        ? `managed:${endpoint.providerOfferingId}`
        : `static:${endpoint.adapter}:${endpoint.providerModel}`;
      if (!endpointKeys.has(key)) current.endpoints.push(endpoint);
    }
    current.contextLength = Math.max(current.contextLength, incoming.contextLength);
    current.topProvider.contextLength = Math.max(
      current.topProvider.contextLength,
      incoming.topProvider.contextLength,
    );
    current.topProvider.maxCompletionTokens = Math.max(
      current.topProvider.maxCompletionTokens,
      incoming.topProvider.maxCompletionTokens,
    );
    current.supportedParameters = [...new Set([
      ...current.supportedParameters,
      ...incoming.supportedParameters,
    ])];
    current.free = current.free || incoming.free;
    current.verified = current.verified || incoming.verified;
    current.pricing.prompt = Math.min(current.pricing.prompt, incoming.pricing.prompt);
    current.pricing.completion = Math.min(
      current.pricing.completion,
      incoming.pricing.completion,
    );
  }
  return [...merged.values()];
}

/** A control-plane outage removes managed routes but never corrupts the bundled fallback catalog. */
export async function allRuntimeModels() {
  const base = allModels();
  // Managed routing needs durable state. The implicit single-process PGlite
  // fallback stays catalog-only unless it is explicitly enabled.
  if (
    process.env.ENABLE_PGLITE !== "true" &&
    !process.env.DATABASE_URL &&
    !process.env.POSTGRES_URL &&
    !process.env.POSTGRES_PRISMA_URL
  ) {
    return base;
  }
  try {
    return mergeRuntimeCatalog(base, await loadManagedProviderModels());
  } catch (error) {
    console.error("Managed provider catalog unavailable", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return base;
  }
}

export function resolveModelSlugFromCatalog(slug: string, catalog: CatalogModel[]) {
  const { id, variants } = parseVariant(slug);
  const [author, name] = id.split("/");
  if (author && (name === "latest" || name === "gpt-latest")) {
    const newest = catalog
      .filter(
        (model) =>
          !model.id.startsWith("nexus/") &&
          (model.author === author || model.id.startsWith(`${author}/`)),
      )
      .sort((a, b) => b.created - a.created)[0];
    if (newest) return variants.length ? `${newest.id}:${variants.join(":")}` : newest.id;
  }
  return slug.startsWith("~") ? slug.slice(1) : slug;
}

export function findModelInCatalog(slug: string, catalog: CatalogModel[]) {
  const resolved = resolveModelSlugFromCatalog(slug, catalog);
  const base = resolved.split(":")[0];
  return catalog.find(
    (model) => model.id === resolved || model.id === base || model.canonicalSlug === base,
  );
}

export async function findRuntimeModel(slug: string) {
  const catalog = await allRuntimeModels();
  return findModelInCatalog(slug, catalog);
}
