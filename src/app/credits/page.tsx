import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { Button } from "@/components/ui/button";
import { allModels } from "@/lib/catalog";
import { CREDIT_PACKS, CREDIT_PURCHASE_FEE } from "@/lib/config";
import { formatUsd } from "@/lib/money";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default function PublicCreditsPage() {
  const feePct = (CREDIT_PURCHASE_FEE * 100).toFixed(1);
  const wired = wiredProviders().length;
  const freeModels = allModels().filter((m) => m.free && !m.id.startsWith("nexus/")).length;

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.12),_transparent_70%)]"
        />
        <MarketingPageHeader title="Credits">
          Inferencia al precio de lista (0% markup). El fee de plataforma ({feePct}%) se cobra solo
          al cargar créditos — igual que un gateway serio, sin sorpresas en el token.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { t: "0% markup", d: "Prompt/completion = catálogo del lab." },
            { t: `${feePct}% al cargar`, d: "Solo en el checkout de créditos." },
            { t: "BYOK first", d: "Tu key, nuestra política. El pool Nexus es opt-in con saldo real." },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
              <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
                {c.t}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{c.d}</p>
            </div>
          ))}
        </div>

        <div className="mb-10 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
            Esta instancia
          </div>
          <div className="grid gap-0 sm:grid-cols-3">
            {[
              { k: "Labs wired", v: `${wired}/${NEXUS_PROVIDERS.length}` },
              { k: "Modelos free", v: String(freeModels) },
              { k: "Fee checkout", v: `${feePct}%` },
            ].map((row, i) => (
              <div
                key={row.k}
                className={`px-4 py-3 ${i ? "border-t border-zinc-100 sm:border-l sm:border-t-0" : ""}`}
              >
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{row.k}</div>
                <div className="mt-1 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
                  {row.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        <h2 className="mb-3 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
          Packs
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Cargo = créditos + fee. Ejemplo: pack $25 → cargo ~{formatUsd(25 * (1 + CREDIT_PURCHASE_FEE), 2)}.
          Runway real se calcula en el dashboard (saldo ÷ burn 7d).
        </p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {CREDIT_PACKS.map((p) => {
            const charge = p.usd * (1 + CREDIT_PURCHASE_FEE);
            const fee = charge - p.usd;
            return (
              <div
                key={p.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white px-4 py-4"
              >
                <div>
                  <div className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-zinc-900">
                    {p.label}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Cargo ~{formatUsd(charge, 2)} · neto {formatUsd(p.usd, 2)} · fee{" "}
                    {formatUsd(fee, 2)}
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-amber-500/70"
                      style={{ width: `${(p.usd / charge) * 100}%` }}
                      title="crédito neto vs cargo"
                    />
                  </div>
                </div>
                <Button asChild className="mt-4 bg-amber-600 text-white hover:bg-amber-700">
                  <Link href="/settings/credits">Comprar en dashboard</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50/80 px-5 py-5 text-sm text-zinc-600">
          <p>
            <strong className="font-medium text-zinc-900">BYOK</strong> — usás tu key de lab; Nexus
            cobra fee de plataforma sobre el precio de lista (ver Docs). No inventamos rieles live
            ni tracción.
          </p>
          <p className="mt-3">
            Sin Stripe en tu instancia: Settings → Conexiones puede acreditar manual si está
            habilitado. Status público en{" "}
            <Link href="/status" className="text-amber-700 hover:underline">
              /status
            </Link>
            .
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild className="bg-zinc-900 text-white hover:bg-zinc-800">
            <Link href="/register">Crear cuenta</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
            <Link href="/docs">API & billing</Link>
          </Button>
        </div>
      </div>
    </MarketingShell>
  );
}
