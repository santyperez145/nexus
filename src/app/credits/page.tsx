import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { Button } from "@/components/ui/button";
import { CREDIT_PACKS, CREDIT_PURCHASE_FEE, SIGNUP_BONUS_MICROS } from "@/lib/config";
import { formatUsd, microsToUsd } from "@/lib/money";

export default function PublicCreditsPage() {
  const feePct = (CREDIT_PURCHASE_FEE * 100).toFixed(1);
  const signup = microsToUsd(SIGNUP_BONUS_MICROS);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Credits">
          Inferencia al precio de lista (0% markup). El fee de plataforma ({feePct}%) se cobra solo
          al cargar créditos — igual que un gateway serio, sin sorpresas en el token.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { t: "0% markup", d: "Prompt/completion = catálogo del lab." },
            { t: `${feePct}% al cargar`, d: "Solo en el checkout de créditos." },
            { t: `${formatUsd(signup, 0)} al signup`, d: "Crédito de bienvenida real, no demo fake." },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
              <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
                {c.t}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{c.d}</p>
            </div>
          ))}
        </div>

        <h2 className="mb-3 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
          Packs
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Cargo = créditos + fee. Ejemplo: pack $25 → cargo ~{formatUsd(25 * (1 + CREDIT_PURCHASE_FEE), 2)}.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {CREDIT_PACKS.map((p) => {
            const charge = p.usd * (1 + CREDIT_PURCHASE_FEE);
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
                    Cargo Stripe ~{formatUsd(charge, 2)} · crédito neto {formatUsd(p.usd, 2)}
                  </p>
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
