import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels } from "@/lib/catalog";
import { providerSnapshot } from "@/lib/gateway/health";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const live = new Set(wiredProviders().map((p) => p.id));
  const wired = live.size;
  const counts = new Map<string, number>();
  for (const m of allModels()) {
    for (const e of m.endpoints) {
      counts.set(e.adapter, (counts.get(e.adapter) ?? 0) + 1);
    }
  }
  let circuits: Array<{ name: string; circuit: string; failures: number }> = [];
  try {
    circuits = await providerSnapshot();
  } catch {
    circuits = [];
  }
  const circuitBy = new Map(circuits.map((c) => [c.name, c]));
  const openCircuits = circuits.filter((c) => c.circuit === "open").length;

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-48 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <MarketingPageHeader title="Providers">
          Hosts de inferencia del catálogo. Conteos = slugs que listan el adapter. Circuitos desde
          Redis — sin uptime inventado.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Hosts", v: String(NEXUS_PROVIDERS.length) },
            { k: "Cableados", v: `${wired}/${NEXUS_PROVIDERS.length}` },
            { k: "Circuit open", v: String(openCircuits) },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{s.k}</div>
              <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold text-zinc-900">
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NEXUS_PROVIDERS.map((p) => {
            const on = live.has(p.id);
            const n = counts.get(p.id) ?? 0;
            const cb = circuitBy.get(p.id);
            const circuit = cb?.circuit ?? "closed";
            return (
              <Link
                key={p.id}
                href={`/providers/${p.id}`}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-amber-600/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-950 group-hover:text-amber-900">
                      {p.label}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-amber-700">{p.id}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      on
                        ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                        : "border-zinc-200 text-zinc-500"
                    }`}
                  >
                    {on ? "wired" : "echo"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-zinc-500">
                    {p.kind}
                  </span>
                  <span className="rounded border border-zinc-200 px-1.5 py-0.5 tabular-nums text-zinc-600">
                    {n} models
                  </span>
                  <span
                    className={`rounded border px-1.5 py-0.5 ${
                      circuit === "open"
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : p.zdr
                          ? "border-amber-600/30 bg-amber-50 text-amber-800"
                          : "border-zinc-200 text-zinc-500"
                    }`}
                  >
                    {circuit === "open" ? "circuit open" : p.zdr ? "ZDR" : circuit}
                  </span>
                </div>
                <div className="mt-3 text-xs text-amber-700 opacity-0 transition-opacity group-hover:opacity-100">
                  Ficha →
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-zinc-500">
          En el request:{" "}
          <code className="text-zinc-700">provider.only: [&quot;groq&quot;, &quot;together&quot;]</code>.{" "}
          Health: <code className="text-zinc-700">GET /api/v1/providers/health</code>.{" "}
          <Link href="/docs/provider-routing" className="text-amber-700 hover:underline">
            Routing docs →
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
