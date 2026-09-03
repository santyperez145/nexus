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

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Providers">
          {NEXUS_PROVIDERS.length} hosts · {wired} cableados en este deploy. Conteos = slugs del
          catálogo que listan el adapter. Circuitos desde Redis (sin uptime inventado).
        </MarketingPageHeader>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-[1fr_4.5rem_5.5rem_4.5rem_5rem] gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-zinc-500 md:grid-cols-[1fr_5rem_6rem_5rem_5.5rem_auto]">
            <span>Provider</span>
            <span>Kind</span>
            <span>Estado</span>
            <span>Models</span>
            <span>Circuit</span>
            <span className="hidden md:block">Catálogo</span>
          </div>
          {NEXUS_PROVIDERS.map((p, i) => {
            const on = live.has(p.id);
            const n = counts.get(p.id) ?? 0;
            const cb = circuitBy.get(p.id);
            const circuit = cb?.circuit ?? "closed";
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_4.5rem_5.5rem_4.5rem_5rem] items-center gap-2 px-4 py-3 md:grid-cols-[1fr_5rem_6rem_5rem_5.5rem_auto] ${
                  i ? "border-t border-zinc-100" : ""
                } ${i % 2 ? "bg-zinc-50/50" : ""}`}
              >
                <div className="min-w-0">
                  <Link
                    href={`/providers/${p.id}`}
                    className="font-medium text-zinc-900 hover:text-amber-800"
                  >
                    {p.label}
                  </Link>
                  <div className="font-mono text-xs text-amber-700">{p.id}</div>
                </div>
                <span className="font-mono text-[11px] text-zinc-500">{p.kind}</span>
                <span
                  className={`w-fit rounded-full border px-2 py-0.5 text-xs ${
                    on
                      ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 bg-white text-zinc-500"
                  }`}
                >
                  {on ? "cableado" : "sin key"}
                </span>
                <span className="tabular-nums text-sm text-zinc-600">{n}</span>
                <span
                  className={`w-fit rounded-full border px-2 py-0.5 text-[11px] ${
                    circuit === "open"
                      ? "border-rose-300 bg-rose-50 text-rose-800"
                      : p.zdr
                        ? "border-amber-600/30 bg-amber-50 text-amber-800"
                        : "border-zinc-200 text-zinc-500"
                  }`}
                  title={cb ? `${cb.failures} fails` : "sin probe"}
                >
                  {circuit === "open" ? "open" : p.zdr ? "ZDR" : circuit}
                </span>
                <Link
                  href={`/providers/${p.id}`}
                  className="hidden text-xs text-amber-700 hover:underline md:block"
                >
                  Ficha →
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-sm text-zinc-500">
          En el request:{" "}
          <code className="text-zinc-700">provider.only: [&quot;groq&quot;, &quot;together&quot;]</code>.{" "}
          Health API: <code className="text-zinc-700">GET /api/v1/providers/health</code>.{" "}
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs →
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
