import { sql } from "drizzle-orm";
import { db, ensureDb, schema } from "@/lib/db";
import { allModels } from "@/lib/catalog";

export async function GET() {
  await ensureDb();
  const rows = await db
    .select({
      model: schema.generations.routedModel,
      tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
      requests: sql<number>`count(*)`,
    })
    .from(schema.generations)
    .groupBy(schema.generations.routedModel);

  const catalog = allModels();
  const data = (rows.length
    ? rows
    : catalog.slice(0, 20).map((m) => ({ model: m.id, tokens: 0, requests: 0 }))
  ).map((r) => ({
    model: r.model,
    tokens: Number(r.tokens ?? 0),
    requests: Number(r.requests ?? 0),
  }));

  return Response.json({ data });
}
