import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { RankingsClient } from "@/components/models/rankings-client";
import { allModels, usdPerMillion } from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RankingsPage() {
  await ensureDb();
  const usage = await db
    .select({
      model: schema.generations.routedModel,
      tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
      requests: sql<number>`count(*)`,
    })
    .from(schema.generations)
    .groupBy(schema.generations.routedModel);

  const byUsage = new Map(usage.map((u) => [u.model, u]));
  const rows = allModels()
    .filter((m) => !m.id.startsWith("nexus/"))
    .map((m) => {
      const u = byUsage.get(m.id);
      const latencyMs = m.endpoints.length
        ? Math.min(...m.endpoints.map((e) => e.latencyMs))
        : null;
      return {
        id: m.id,
        promptPerM: usdPerMillion(m.pricing.prompt),
        free: m.free,
        tokens: Number(u?.tokens ?? 0),
        requests: Number(u?.requests ?? 0),
        latencyMs,
      };
    });

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Rankings">
          Popular = tokens reales de esta plataforma. Precio y latencia salen del catálogo. Sin
          tracción inventada · {rows.length} modelos.
        </MarketingPageHeader>
        <RankingsClient rows={rows} />
      </div>
    </MarketingShell>
  );
}
