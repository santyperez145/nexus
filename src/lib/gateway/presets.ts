import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { ChatRequest } from "./types";

export function presetSlugFromModel(model?: string) {
  if (!model) return null;
  if (model.startsWith("@")) return model.slice(1);
  if (model.startsWith("nexus/preset/")) return model.slice("nexus/preset/".length);
  return null;
}

export async function applyPreset(req: ChatRequest, userId: string): Promise<ChatRequest> {
  const slug = presetSlugFromModel(req.model);
  if (!slug) return req;
  const [row] = await db
    .select()
    .from(schema.presets)
    .where(and(eq(schema.presets.userId, userId), eq(schema.presets.slug, slug)))
    .limit(1);
  if (!row) throw Object.assign(new Error(`Preset not found: ${slug}`), { status: 404 });
  const cfg = row.config;
  return {
    ...cfg,
    ...req,
    model: typeof cfg.model === "string" ? cfg.model : req.model,
    provider: req.provider ?? (cfg.provider as ChatRequest["provider"]),
    temperature: req.temperature ?? (cfg.temperature as number | undefined),
    max_tokens: req.max_tokens ?? (cfg.max_tokens as number | undefined),
  };
}
