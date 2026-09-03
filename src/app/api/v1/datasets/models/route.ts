import { sql, gte } from "drizzle-orm";
import { db, ensureDb, schema } from "@/lib/db";
import { allModels } from "@/lib/catalog";

export async function GET(req: Request) {
  await ensureDb();
  const url = new URL(req.url);
  const windowKey = url.searchParams.get("window");
  const nowMs = Date.now();
  const since =
    windowKey === "7d"
      ? new Date(nowMs - 7 * 24 * 60 * 60 * 1000)
      : windowKey === "30d"
        ? new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
        : null;

  const rows = since
    ? await db
        .select({
          model: schema.generations.routedModel,
          tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
          requests: sql<number>`count(*)`,
          avg_latency_ms: sql<number | null>`avg(${schema.generations.latencyMs})`,
        })
        .from(schema.generations)
        .where(gte(schema.generations.createdAt, since))
        .groupBy(schema.generations.routedModel)
    : await db
        .select({
          model: schema.generations.routedModel,
          tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
          requests: sql<number>`count(*)`,
          avg_latency_ms: sql<number | null>`avg(${schema.generations.latencyMs})`,
        })
        .from(schema.generations)
        .groupBy(schema.generations.routedModel);

  const catalog = allModels();
  const data = (rows.length
    ? rows
    : catalog.slice(0, 20).map((m) => ({
        model: m.id,
        tokens: 0,
        requests: 0,
        avg_latency_ms: null as number | null,
      }))
  ).map((r) => ({
    model: r.model,
    tokens: Number(r.tokens ?? 0),
    requests: Number(r.requests ?? 0),
    avg_latency_ms:
      r.avg_latency_ms != null && Number.isFinite(Number(r.avg_latency_ms))
        ? Math.round(Number(r.avg_latency_ms))
        : null,
  }));

  return Response.json({ data, window: windowKey || "all" });
}
