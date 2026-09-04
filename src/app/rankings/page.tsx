import Link from "next/link";
import { sql, gte, ne, and } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { RankingsClient } from "@/components/models/rankings-client";
import {
  allModels,
  hasExecutableEndpoint,
  isTextGenerationModel,
  usdPerMillion,
} from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";
import { GUEST_USER_ID } from "@/lib/gateway/guest";

export const dynamic = "force-dynamic";

function rankingWindowStart(windowKey: "7d" | "30d"): Date {
  const days = windowKey === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; page?: string; sort?: string; free?: string; modality?: string }>;
}) {
  const sp = await searchParams;
  const windowKey = sp.window === "7d" || sp.window === "30d" ? sp.window : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const sort = sp.sort === "price" || sp.sort === "latency" ? sp.sort : "popular";
  const modality = sp.modality === "text" || sp.modality === "vision" ? sp.modality : "all";
  await ensureDb();

  const since =
    windowKey === "7d" || windowKey === "30d"
      ? rankingWindowStart(windowKey)
      : null;

  const usageWhere = since
    ? and(ne(schema.generations.userId, GUEST_USER_ID), gte(schema.generations.createdAt, since))
    : ne(schema.generations.userId, GUEST_USER_ID);

  const usage = await db
    .select({
      model: schema.generations.routedModel,
      tokens: sql<number>`sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens})`,
      requests: sql<number>`count(*)`,
      avgLatency: sql<number | null>`avg(${schema.generations.latencyMs})`,
    })
    .from(schema.generations)
    .where(usageWhere)
    .groupBy(schema.generations.routedModel);

  const byUsage = new Map(usage.map((u) => [u.model, u]));
  const rows = allModels()
    .filter((model) => !model.id.startsWith("nexus/") && isTextGenerationModel(model))
    .map((m) => {
      const u = byUsage.get(m.id);
      const measured =
        u?.avgLatency != null && Number.isFinite(Number(u.avgLatency))
          ? Math.round(Number(u.avgLatency))
          : null;
      const inputs = m.architecture?.inputModalities ?? ["text"];
      return {
        id: m.id,
        promptPerM: hasExecutableEndpoint(m) ? usdPerMillion(m.pricing.prompt) : null,
        free: m.free,
        tokens: Number(u?.tokens ?? 0),
        requests: Number(u?.requests ?? 0),
        latencyMs: measured,
        measured: measured != null,
        providers: [...new Set(m.endpoints.map((e) => e.adapter))].slice(0, 3),
        vision: inputs.includes("image"),
        modality: m.architecture?.modality ?? "text->text",
      };
    });

  const measuredCount = rows.filter((r) => r.measured).length;
  const withTraffic = rows.filter((r) => r.tokens > 0).length;

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <MarketingPageHeader title="Ranking de modelos">
          Descubrí qué modelos eligen los equipos, cuáles cuestan menos y cuáles responden más rápido
          con datos del uso real de Nexus.
        </MarketingPageHeader>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Modelos", v: String(rows.length) },
            { k: "Con uso registrado", v: String(withTraffic) },
            { k: "Con velocidad medida", v: String(measuredCount) },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.k}</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-6 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["all", "Histórico"],
              ["7d", "7 días"],
              ["30d", "30 días"],
            ] as const
          ).map(([id, label]) => (
            <Link
              key={id}
              href={id === "all" ? "/rankings" : `/rankings?window=${id}`}
              className={`rounded-lg border px-3 py-1.5 ${
                windowKey === id
                  ? "border-violet-300 bg-violet-50 text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <RankingsClient
          rows={rows}
          windowKey={windowKey}
          initialPage={page}
          initialSort={sort}
          initialFree={sp.free === "1"}
          initialModality={modality}
        />
      </div>
    </MarketingShell>
  );
}
