import Link from "next/link";
import { sql, gte } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { RankingsClient } from "@/components/models/rankings-client";
import { allModels, usdPerMillion } from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowKey = sp.window === "7d" || sp.window === "30d" ? sp.window : "all";
  await ensureDb();

  const nowMs = Date.now();
  const since =
    windowKey === "7d"
      ? new Date(nowMs - 7 * 24 * 60 * 60 * 1000)
      : windowKey === "30d"
        ? new Date(nowMs - 30 * 24 * 60 * 60 * 1000)
        : null;

  const usage = since
    ? await db
        .select({
          model: schema.generations.routedModel,
          tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
          requests: sql<number>`count(*)`,
          avgLatency: sql<number | null>`avg(${schema.generations.latencyMs})`,
        })
        .from(schema.generations)
        .where(gte(schema.generations.createdAt, since))
        .groupBy(schema.generations.routedModel)
    : await db
        .select({
          model: schema.generations.routedModel,
          tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
          requests: sql<number>`count(*)`,
          avgLatency: sql<number | null>`avg(${schema.generations.latencyMs})`,
        })
        .from(schema.generations)
        .groupBy(schema.generations.routedModel);

  const byUsage = new Map(usage.map((u) => [u.model, u]));
  const rows = allModels()
    .filter((m) => !m.id.startsWith("nexus/"))
    .map((m) => {
      const u = byUsage.get(m.id);
      const catalogLatency = m.endpoints.length
        ? Math.min(...m.endpoints.map((e) => e.latencyMs))
        : null;
      const measured =
        u?.avgLatency != null && Number.isFinite(Number(u.avgLatency))
          ? Math.round(Number(u.avgLatency))
          : null;
      return {
        id: m.id,
        promptPerM: usdPerMillion(m.pricing.prompt),
        free: m.free,
        tokens: Number(u?.tokens ?? 0),
        requests: Number(u?.requests ?? 0),
        latencyMs: measured ?? catalogLatency,
        measured: measured != null,
        providers: [...new Set(m.endpoints.map((e) => e.adapter))].slice(0, 3),
      };
    });

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <MarketingPageHeader title="Rankings">
          Popular = tokens reales de esta instancia
          {windowKey !== "all" ? ` (${windowKey})` : ""}. Latencia prioriza avg medido de{" "}
          <code className="text-zinc-700">generation.latency_ms</code>; si no hay datos, cae al
          catálogo. Sin tracción inventada · {rows.length} modelos.
        </MarketingPageHeader>
        <div className="mb-6 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["all", "All time"],
              ["7d", "7 días"],
              ["30d", "30 días"],
            ] as const
          ).map(([id, label]) => (
            <Link
              key={id}
              href={id === "all" ? "/rankings" : `/rankings?window=${id}`}
              className={`rounded-lg border px-3 py-1.5 ${
                windowKey === id
                  ? "border-amber-600/40 bg-amber-50 text-amber-900"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <RankingsClient rows={rows} windowKey={windowKey} />
      </div>
    </MarketingShell>
  );
}
