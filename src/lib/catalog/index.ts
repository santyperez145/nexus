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

export function findModel(slug: string): CatalogModel | undefined {
  const base = slug.split(":")[0];
  return allModels().find((m) => m.id === slug || m.id === base || m.canonicalSlug === base);
}

export function parseVariant(slug: string) {
  const [id, ...rest] = slug.split(":");
  return { id, variants: rest };
}

export function usdPerMillion(perToken: number) {
  return perToken * 1_000_000;
}
