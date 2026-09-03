import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels } from "@/lib/catalog";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const wired = wiredProviders();
  const live = new Set(wired.map((p) => p.id));
  const models = allModels().filter((m) => !m.id.startsWith("nexus/")).length;
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const redis = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.REDIS_URL?.trim());
  const postgres = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-3xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
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
              value: wired.length ? "live hops" : "unconfigured",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <h2 className="mb-3 text-lg font-semibold text-zinc-900">
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

        <h2 className="mb-3 text-lg font-semibold text-zinc-900">
          Inference hosts
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {NEXUS_PROVIDERS.map((p, i) => {
            const on = live.has(p.id);
            return (
              <Link
                key={p.id}
                href={`/providers/${p.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-violet-50/40 ${
                  i ? "border-t border-zinc-100" : ""
                }`}
              >
                <span className="font-mono text-violet-700">{p.id}</span>
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
          <Link href="/api/v1/status" className="text-violet-700 hover:underline">
            GET /api/v1/status
          </Link>{" "}
          → <code className="text-zinc-700">mode: live|unconfigured</code>,{" "}
          <code className="text-zinc-700">ok</code> requiere Postgres, Redis y al menos un provider cableado.
        </p>

        <div className="mt-8 rounded-xl border border-zinc-200 bg-white px-4 py-4">
          <div className="font-semibold text-zinc-900">
            Playground local
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            En desarrollo, Chat y Arena pueden usar <code className="text-zinc-800">X-Nexus-Guest: 1</code>{" "}
            solo contra completions. No crea keys ni toca wallet. Producción requiere Bearer.
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
