import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql, desc } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels } from "@/lib/catalog";
import { db } from "@/lib/db";
import { generations } from "@/lib/db/schema";
import { providerSnapshot } from "@/lib/gateway/health";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = NEXUS_PROVIDERS.find((p) => p.id === id);
  if (!provider) notFound();

  const live = new Set(wiredProviders().map((p) => p.id));
  const wired = live.has(provider.id);
  const models = allModels()
    .filter((m) => m.endpoints.some((e) => e.adapter === provider.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  let circuit = "closed";
  let failures = 0;
  try {
    const snap = await providerSnapshot();
    const row = snap.find((c) => c.name === provider.id);
    if (row) {
      circuit = row.circuit;
      failures = row.failures;
    }
  } catch {
    /* sin redis */
  }

  let genCount = 0;
  let avgLatency: number | null = null;
  try {
    const [agg] = await db
      .select({
        n: sql<number>`count(*)::int`,
        avgLat: sql<number | null>`avg(${generations.latencyMs})`,
      })
      .from(generations)
      .where(eq(generations.provider, provider.id));
    genCount = Number(agg?.n ?? 0);
    avgLatency = agg?.avgLat != null ? Math.round(Number(agg.avgLat)) : null;
  } catch {
    genCount = 0;
  }

  let recent: Array<{ id: string; model: string; latencyMs: number | null; createdAt: Date }> = [];
  try {
    recent = await db
      .select({
        id: generations.id,
        model: generations.routedModel,
        latencyMs: generations.latencyMs,
        createdAt: generations.createdAt,
      })
      .from(generations)
      .where(eq(generations.provider, provider.id))
      .orderBy(desc(generations.createdAt))
      .limit(8);
  } catch {
    recent = [];
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <p className="mb-3 text-sm text-zinc-500">
          <Link href="/providers" className="text-violet-700 hover:underline">
            Providers
          </Link>
          <span className="mx-2 text-zinc-300">/</span>
          <span className="font-mono text-zinc-700">{provider.id}</span>
        </p>
        <MarketingPageHeader title={provider.label}>
          Host de inferencia · kind <code className="text-zinc-800">{provider.kind}</code>
          {provider.zdr ? " · marcado ZDR cuando el endpoint lo declara" : ""}. Stats de generaciones
          son de esta instancia (no uptime inventado).
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Estado"
            value={wired ? "cableado" : "sin key"}
            tone={wired ? "ok" : "muted"}
          />
          <Stat label="Models en catálogo" value={String(models.length)} />
          <Stat
            label="Circuit"
            value={circuit === "open" ? `open (${failures})` : circuit}
            tone={circuit === "open" ? "warn" : "muted"}
          />
          <Stat
            label="Gens / latencia media"
            value={
              genCount
                ? `${genCount}${avgLatency != null ? ` · ${avgLatency} ms` : ""}`
                : "sin datos aún"
            }
          />
        </div>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            Cómo pedirlo
          </h2>
          <pre className="overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
{`"provider": {
  "only": ["${provider.id}"],
  "allow_fallbacks": false
}`}
          </pre>
          <p className="mt-3 text-sm text-zinc-500">
            Env de plataforma: <code className="text-zinc-700">{provider.env}</code>
            {provider.extraEnv?.length ? ` (+ ${provider.extraEnv.join(", ")})` : ""}. BYOK en{" "}
            <Link href="/settings/byok" className="text-violet-700 hover:underline">
              Settings → BYOK
            </Link>
            .
          </p>
        </section>

        <section className="mb-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Modelos ({Math.min(models.length, 24)}
              {models.length > 24 ? ` de ${models.length}` : ""})
            </h2>
            <Link
              href={`/models?lab=${encodeURIComponent(provider.id)}`}
              className="text-sm text-violet-700 hover:underline"
            >
              Ver todos →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {models.slice(0, 24).map((m, i) => (
              <Link
                key={m.id}
                href={`/models/${m.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-violet-50/50 ${
                  i ? "border-t border-zinc-100" : ""
                }`}
              >
                <span className="truncate font-medium text-zinc-900">{m.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-zinc-500">{m.id}</span>
              </Link>
            ))}
            {models.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">Sin slugs en el catálogo para este adapter.</p>
            ) : null}
          </div>
        </section>

        {recent.length ? (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900">
              Actividad reciente (instancia)
            </h2>
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {recent.map((g, i) => (
                <div
                  key={g.id}
                  className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm ${
                    i ? "border-t border-zinc-100" : ""
                  }`}
                >
                  <span className="font-mono text-xs text-zinc-600">{g.model}</span>
                  <span className="text-xs text-zinc-500">
                    {g.latencyMs != null ? `${g.latencyMs} ms` : "—"} ·{" "}
                    {g.createdAt.toISOString().slice(0, 19)}Z
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </MarketingShell>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "ok" ? "text-emerald-800" : tone === "warn" ? "text-rose-800" : "text-zinc-900";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.06em] text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}
