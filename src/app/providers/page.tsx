import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export default function ProvidersPage() {
  const live = new Set(wiredProviders().map((p) => p.id));
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight">Providers</h1>
        <p className="mb-8 max-w-2xl text-zinc-500">
          Hosts de inferencia. Un slug puede caer en varios. Cableado = key de plataforma en este
          deploy; si no, usá BYOK en Settings.
        </p>
        <div className="grid gap-3">
          {NEXUS_PROVIDERS.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-t border-zinc-200 pt-3"
            >
              <div>
                <div className="font-medium text-zinc-900">{p.label}</div>
                <div className="font-mono text-xs text-amber-700">{p.id}</div>
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
          <code className="text-zinc-700">provider.only: [&quot;groq&quot;, &quot;together&quot;]</code>.{" "}
          <Link href="/docs" className="text-amber-700 hover:underline">
            Docs
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
