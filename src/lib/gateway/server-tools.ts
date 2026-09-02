import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { ChatRequest } from "./types";
import { fetchUrlText, searchWeb } from "@/lib/search/web";

function toolType(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const t = (entry as { type?: string }).type;
  return typeof t === "string" ? t : undefined;
}

export function wantsServerTools(req: ChatRequest, variants: string[]) {
  if (variants.includes("online")) return true;
  if (req.plugins?.some((p) => p.id === "web" || p.id === "web-fetch")) return true;
  return (req.tools ?? []).some((t) => {
    const type = toolType(t) ?? "";
    return type.startsWith("nexus:") || type.startsWith("openrouter:");
  });
}

export function buildServerTools(req: ChatRequest, variants: string[]): ToolSet | undefined {
  if (!wantsServerTools(req, variants)) return undefined;
  const types = new Set(
    (req.tools ?? []).map((t) => toolType(t) ?? "").filter(Boolean),
  );
  const wantAll = variants.includes("online") || req.plugins?.some((p) => p.id === "web");
  const wantSearch =
    wantAll || types.has("nexus:web_search") || types.has("openrouter:web_search");
  const wantFetch =
    types.has("nexus:web_fetch") ||
    types.has("openrouter:web_fetch") ||
    req.plugins?.some((p) => p.id === "web-fetch");
  const wantTime = wantAll || types.has("nexus:datetime") || types.has("openrouter:datetime");

  const tools: ToolSet = {};
  if (wantSearch) {
    tools.web_search = tool({
      description: "Busca en la web información actual y devuelve títulos, URLs y snippets.",
      inputSchema: z.object({ query: z.string().describe("Consulta de búsqueda") }),
      execute: async ({ query }) => searchWeb(query),
    });
  }
  if (wantFetch) {
    tools.web_fetch = tool({
      description: "Descarga y extrae el texto de una URL pública.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url }) => fetchUrlText(url),
    });
  }
  if (wantTime) {
    tools.datetime = tool({
      description: "Fecha y hora actuales en ISO-8601 (UTC).",
      inputSchema: z.object({ timezone: z.string().optional() }),
      execute: async () => ({ iso: new Date().toISOString(), unix: Math.floor(Date.now() / 1000) }),
    });
  }
  return Object.keys(tools).length ? tools : undefined;
}
