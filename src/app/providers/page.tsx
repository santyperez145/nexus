import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export default function ProvidersPage() {
  const live = new Set(wiredProviders().map((p) => p.id));
  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-2 text-3xl font-semibold">Providers</h1>
        <p className="mb-8 max-w-2xl text-zinc-500">
          Hosts de inferencia. Un slug de modelo puede caer en varios. Verde = key de plataforma
          cableada en este deploy; el resto se salta o usa BYOK.
        </p>
        <div className="grid gap-3">
          {NEXUS_PROVIDERS.map((p) => (
            <div key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/10 pt-3">
              <div>
                <div className="font-medium text-white">{p.label}</div>
                <div className="font-mono text-xs text-amber-400/80">{p.id}</div>
              </div>
              <div className="text-sm text-zinc-500">
                {live.has(p.id) ? "cableado" : "sin key de plataforma"}
                {p.zdr ? " · ZDR" : ""}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-sm text-zinc-500">
          Para filtrar en el request:{" "}
          <code className="text-zinc-300">provider.only: [&quot;groq&quot;, &quot;together&quot;]</code>.{" "}
          <Link href="/docs" className="text-amber-400 hover:underline">
            Docs
          </Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
