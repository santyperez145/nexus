import Link from "next/link";
import { desc } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels } from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const wired = wiredProviders();
  const live = new Set(wired.map((p) => p.id));
  const models = allModels().filter((m) => !m.id.startsWith("nexus/")).length;
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const redis = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.REDIS_URL?.trim());
  const postgres = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());

  let lastGen: {
    id: string;
    provider: string;
    model: string;
    createdAt: Date;
  } | null = null;
  try {
    await ensureDb();
    const [row] = await db
      .select({
        id: schema.generations.id,
        provider: schema.generations.provider,
        model: schema.generations.routedModel,
        createdAt: schema.generations.createdAt,
      })
      .from(schema.generations)
      .orderBy(desc(schema.generations.createdAt))
      .limit(1);
    lastGen = row ?? null;
  } catch {
    lastGen = null;
  }

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-3xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <MarketingPageHeader title="Status">
          Cables de esta instancia. Sin uptime inventado: solo qué está configurado ahora.
        </MarketingPageHeader>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Models", value: String(models) },
            { label: "Providers live", value: `${wired.length}/${NEXUS_PROVIDERS.length}` },
            {
              label: "Mode",
              value: wired.length ? "live hops" : "local echo",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.label}</div>
              <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold text-zinc-900">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {lastGen ? (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
              Última generación (instancia)
            </div>
            <div className="mt-1 font-mono text-xs text-zinc-700">
              {lastGen.id} · {lastGen.provider} · {lastGen.model}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {lastGen.createdAt.toISOString().slice(0, 19)}Z
            </div>
          </div>
        ) : (
          <p className="mb-8 rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500">
            Todavía no hay generaciones en esta DB. Probalo desde{" "}
            <Link href="/chat" className="text-amber-700 hover:underline">
              /chat
            </Link>
            .
          </p>
        )}

        <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
          Infra
        </h2>
        <div className="mb-10 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {[
            { id: "postgres", ok: postgres },
            { id: "stripe", ok: stripe },
            { id: "redis", ok: redis },
          ].map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center justify-between px-4 py-3 text-sm ${i ? "border-t border-zinc-100" : ""}`}
            >
              <span className="font-mono text-zinc-700">{row.id}</span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  row.ok
                    ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                    : "border-zinc-200 text-zinc-500"
                }`}
              >
                {row.ok ? "configured" : "missing"}
              </span>
            </div>
          ))}
        </div>

        <h2 className="mb-3 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
          Inference hosts
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {NEXUS_PROVIDERS.map((p, i) => {
            const on = live.has(p.id);
            return (
              <Link
                key={p.id}
                href={`/providers/${p.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-amber-50/40 ${
                  i ? "border-t border-zinc-100" : ""
                }`}
              >
                <span className="font-mono text-amber-700">{p.id}</span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    on
                      ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 text-zinc-500"
                  }`}
                >
                  {on ? "wired" : "unwired"}
                </span>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-sm text-zinc-500">
          JSON machine-readable:{" "}
          <Link href="/api/v1/status" className="text-amber-700 hover:underline">
            GET /api/v1/status
          </Link>{" "}
          → <code className="text-zinc-700">mode: live|echo</code>,{" "}
          <code className="text-zinc-700">ok</code> requiere Postgres cableado.
        </p>
      </div>
    </MarketingShell>
  );
}
