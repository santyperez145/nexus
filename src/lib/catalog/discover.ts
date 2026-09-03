import type { CatalogModel, ModelEndpoint } from "./types";
import { OWNED_CATALOG } from "./owned";
import {
  NEXUS_PROVIDERS,
  authHeaders,
  envFor,
  isWired,
  modelsUrl,
  type NexusProvider,
} from "@/lib/providers/registry";

type Discovered = { id: string; name: string; providerModel: string; adapter: string };

const CAP: Record<string, number> = {
  huggingface: 40,
  together: 80,
  fireworks: 80,
  deepinfra: 80,
  novita: 60,
  nebius: 60,
  nvidia: 40,
  siliconflow: 60,
};

function slugAuthor(p: NexusProvider) {
  if (p.id === "mistral") return "mistralai";
  if (p.id === "xai") return "x-ai";
  if (p.id === "qwen") return "qwen";
  if (p.id === "moonshot") return "moonshotai";
  return p.id;
}

async function safeJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  return res.json();
}

function parseList(p: NexusProvider, json: unknown): Discovered[] {
  if (!json || typeof json !== "object") return [];
  const author = slugAuthor(p);
  const cap = CAP[p.id] ?? 80;

  if (p.kind === "google") {
    const data = ((json as { models?: Array<{ name?: string; displayName?: string }> }).models ?? [])
      .map((m) => {
        const raw = (m.name ?? "").replace(/^models\//, "");
        return { raw, name: m.displayName ?? raw };
      })
      .filter((m) => /gemini|gemma/i.test(m.raw));
    return data.slice(0, cap).map((m) => ({
      id: `${author}/${m.raw}`,
      name: m.name,
      providerModel: m.raw,
      adapter: p.id,
    }));
  }

  const data = ((json as { data?: Array<{ id?: string; name?: string; display_name?: string }> }).data ?? [])
    .map((m) => {
      const raw = m.id ?? "";
      return { raw, name: m.display_name ?? m.name ?? raw };
    })
    .filter((m) => m.raw && !m.raw.includes(" "));

  return data.slice(0, cap).map((m) => ({
    id: `${author}/${m.raw}`,
    name: m.name,
    providerModel: m.raw,
    adapter: p.id,
  }));
}

async function discoverProvider(p: NexusProvider): Promise<Discovered[]> {
  if (!isWired(p)) return [];
  const key = envFor(p);
  if (!key) return [];
  const json = await safeJson(modelsUrl(p, key), authHeaders(p, key));
  if (!json) return [];
  return parseList(p, json);
}

function endpointOf(item: Discovered, zdr: boolean): ModelEndpoint {
  return {
    name: item.adapter,
    adapter: item.adapter,
    providerModel: item.providerModel,
    pricing: { prompt: 0, completion: 0 },
    latencyMs: 0,
    throughputTps: 0,
    zdr,
    uptime: 0.99,
    quantization: "unknown",
  };
}

function toCatalog(item: Discovered, zdr: boolean): CatalogModel {
  const author = item.id.split("/")[0] ?? item.adapter;
  return {
    id: item.id,
    name: item.name,
    description: `Descubierto desde la API oficial de ${item.adapter}.`,
    author,
    created: Math.floor(Date.now() / 1000),
    contextLength: 128000,
    architecture: {
      modality: "text->text",
      inputModalities: ["text"],
      outputModalities: ["text"],
      tokenizer: author,
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
    topProvider: { contextLength: 128000, maxCompletionTokens: 8192, isModerated: zdr },
    supportedParameters: ["temperature", "max_tokens", "stream"],
    knowledgeCutoff: null,
    huggingFaceId: null,
    canonicalSlug: item.id,
    free: false,
    endpoints: [endpointOf(item, zdr)],
  };
}

function sameEndpoint(a: ModelEndpoint, b: ModelEndpoint) {
  return a.adapter === b.adapter && a.providerModel === b.providerModel;
}

export async function discoverOfficialCatalog(): Promise<CatalogModel[]> {
  const batches = await Promise.all(
    NEXUS_PROVIDERS.map((p) => discoverProvider(p).catch(() => [] as Discovered[])),
  );
  const extra = batches.flat();

  const byId = new Map<string, CatalogModel>();
  for (const m of OWNED_CATALOG) {
    byId.set(m.id, {
      ...m,
      endpoints: [...m.endpoints],
    });
  }

  const known = [...byId.values()];

  for (const item of extra) {
    const zdr = false;
    const ep = endpointOf(item, zdr);

    const ownedHit = known.find(
      (m) =>
        m.id === item.id ||
        m.endpoints.some((e) => sameEndpoint(e, ep)) ||
        m.endpoints.some((e) => e.providerModel === item.providerModel && e.adapter === item.adapter),
    );
    if (ownedHit) {
      if (!ownedHit.endpoints.some((e) => sameEndpoint(e, ep))) {
        ownedHit.endpoints.push(ep);
      }
      continue;
    }

    const existing = byId.get(item.id);
    if (existing) {
      if (!existing.endpoints.some((e) => sameEndpoint(e, ep))) {
        existing.endpoints.push(ep);
      }
      continue;
    }
    byId.set(item.id, toCatalog(item, zdr));
  }

  return [...byId.values()];
}
