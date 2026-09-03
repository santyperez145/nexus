import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { Button } from "@/components/ui/button";

const CAPS = [
  {
    t: "ZDR",
    d: "Preferí endpoints de retención cero. Hard filter cuando lo pedís en Privacy o provider.data_collection.",
    href: "/settings/privacy",
  },
  {
    t: "Guardrails",
    d: "Allow/block por prefijo de modelo o lab. El gateway corta con 403 tipado.",
    href: "/settings/guardrails",
  },
  {
    t: "Workspaces + budgets",
    d: "Separa proyectos. Toggle BYOK-in-budget. Progress real de spent/limit.",
    href: "/settings/workspaces",
  },
  {
    t: "Webhooks HMAC",
    d: "Eventos de generación firmados. Ping desde Observability.",
    href: "/settings/observability",
  },
  {
    t: "Orgs + invites",
    d: "Invitá por email. Pendientes visibles hasta aceptar.",
    href: "/settings/organizations",
  },
  {
    t: "Route Trace",
    d: "POST /api/v1/routing/preview y panel en el playground — hops antes de gastar.",
    href: "/docs",
  },
] as const;

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Enterprise">
          Controles reales de privacidad, presupuesto y auditoría — no un “plan Enterprise”
          inventado ni sponsors de banco. Lo que ves acá ya corre en el gateway.
        </MarketingPageHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAPS.map((c) => (
            <Link
              key={c.t}
              href={c.href}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-4 transition-colors hover:border-amber-600/40"
            >
              <div className="font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
                {c.t}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{c.d}</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-8">
          <h2 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
            Qué no prometemos
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
            <li>SLA de laboratorios de terceros.</li>
            <li>Tracción, rankings o uptime inventados.</li>
            <li>Rieles bancarios / Coelsa / AWS retainer sin autorización expresa.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
            <Link href="/docs">Docs Enterprise / ZDR</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
            <Link href="/register">Empezar</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
            <Link href="/status">Status de la instancia</Link>
          </Button>
        </div>
      </div>
    </MarketingShell>
  );
}
