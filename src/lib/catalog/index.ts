import { bundledModels } from "./bundled";
import { readCatalogFile } from "./store";
import type { CatalogModel, ModelEndpoint } from "./types";

export type { CatalogModel, ModelEndpoint };
export const MODEL_CATALOG = bundledModels();

export const BUILTIN_ROUTERS: CatalogModel[] = [
  {
    id: "nexus/auto",
    name: "Nexus Auto Router",
    description: "Elige el mejor modelo por complejidad, precio y disponibilidad.",
    author: "nexus",
    created: Math.floor(Date.now() / 1000),
    contextLength: 1_000_000,
    architecture: {
      modality: "text+image->text",
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      tokenizer: "Router",
    },
    pricing: {
      prompt: 0,
      completion: 0,
      request: 0,
      image: 0,
      webSearch: 0,
      inputCacheRead: 0,
      inputCacheWrite: 0,
    },
    topProvider: { contextLength: 1_000_000, maxCompletionTokens: 128000, isModerated: false },
    supportedParameters: ["temperature", "max_tokens", "tools", "stream"],
    knowledgeCutoff: null,
    huggingFaceId: null,
    canonicalSlug: "nexus/auto",
    free: false,
    verified: false,
    endpoints: [],
  },
  {
    id: "nexus/free",
    name: "Nexus Free Router",
    description: "Enruta solo a modelos gratis disponibles en el catálogo Nexus.",
    author: "nexus",
    created: Math.floor(Date.now() / 1000),
    contextLength: 128000,
    architecture: {
      modality: "text->text",
      inputModalities: ["text"],
      outputModalities: ["text"],
      tokenizer: "Router",
    },
    pricing: {
      prompt: 0,
      completion: 0,
      request: 0,
      image: 0,
      webSearch: 0,
      inputCacheRead: 0,
      inputCacheWrite: 0,
    },
    topProvider: { contextLength: 128000, maxCompletionTokens: 8192, isModerated: false },
    supportedParameters: ["temperature", "max_tokens", "stream"],
    knowledgeCutoff: null,
    huggingFaceId: null,
    canonicalSlug: "nexus/free",
    free: true,
    verified: false,
    endpoints: [],
  },
];

export function allModels(): CatalogModel[] {
  const bundled = MODEL_CATALOG;
  const live = readCatalogFile();
  const byId = new Map<string, CatalogModel>();
  for (const m of bundled) byId.set(m.id, m);
  if (live?.length) {
    for (const m of live) byId.set(m.id, m);
  }
  const routers = BUILTIN_ROUTERS.filter((r) => !byId.has(r.id));
  return [...routers, ...byId.values()];
}

export function parseVariant(slug: string) {
  const trimmed = slug.startsWith("~") ? slug.slice(1) : slug;
  const [id, ...rest] = trimmed.split(":");
  return { id, variants: rest };
}

/** `~openai/latest` / `openai/gpt-latest` → newest slug of that author in the catalog. */
export function resolveModelSlug(slug: string): string {
  const { id, variants } = parseVariant(slug);
  const [author, name] = id.split("/");
  if (author && (name === "latest" || name === "gpt-latest")) {
    const newest = allModels()
      .filter((m) => !m.id.startsWith("nexus/") && (m.author === author || m.id.startsWith(`${author}/`)))
      .sort((a, b) => b.created - a.created)[0];
    if (newest) return variants.length ? `${newest.id}:${variants.join(":")}` : newest.id;
  }
  return slug.startsWith("~") ? slug.slice(1) : slug;
}

export function findModel(slug: string): CatalogModel | undefined {
  const resolved = resolveModelSlug(slug);
  const base = resolved.split(":")[0];
  return allModels().find((m) => m.id === resolved || m.id === base || m.canonicalSlug === base);
}

export function featuredModels(limit = 6): CatalogModel[] {
  const prefer = [
    "nexus/auto",
    "openai/gpt-4o",
    "anthropic/claude-sonnet-4.6",
    "meta-llama/llama-3.3-70b-instruct",
    "google/gemini-2.5-flash",
    "openai/gpt-5",
  ];
  const all = allModels();
  const picked: CatalogModel[] = [];
  for (const id of prefer) {
    const m = all.find((row) => row.id === id);
    if (m) picked.push(m);
    if (picked.length >= limit) return picked;
  }
  for (const m of all) {
    if (picked.some((p) => p.id === m.id)) continue;
    picked.push(m);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function usdPerMillion(perToken: number) {
  return perToken * 1_000_000;
}
