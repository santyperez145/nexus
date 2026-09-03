import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export default function ProvidersPage() {
  const live = new Set(wiredProviders().map((p) => p.id));
  const wired = live.size;
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Providers">
          {NEXUS_PROVIDERS.length} hosts · {wired} cableados en este deploy. Un slug puede caer en varios;
          sin key de plataforma usá BYOK.
        </MarketingPageHeader>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
            <span>Provider</span>
            <span>Estado</span>
            <span>Policy</span>
          </div>
          {NEXUS_PROVIDERS.map((p, i) => {
            const on = live.has(p.id);
            return (
              <div
                key={p.id}
                className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 ${
                  i ? "border-t border-zinc-100" : ""
                } ${i % 2 ? "bg-zinc-50/50" : ""}`}
              >
                <div>
                  <div className="font-medium text-zinc-900">{p.label}</div>
                  <div className="font-mono text-xs text-amber-700">{p.id}</div>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    on
                      ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 bg-white text-zinc-500"
                  }`}
                >
                  {on ? "cableado" : "sin key"}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    p.zdr
                      ? "border-amber-600/30 bg-amber-50 text-amber-800"
                      : "border-transparent text-zinc-400"
                  }`}
                >
                  {p.zdr ? "ZDR" : "standard"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-sm text-zinc-500">
          En el request:{" "}
          <code className="text-zinc-700">provider.only: [&quot;groq&quot;, &quot;together&quot;]</code>.{" "}
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs →
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
