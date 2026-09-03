import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { Button } from "@/components/ui/button";
import { allModels } from "@/lib/catalog";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

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
    href: "/docs/provider-routing",
  },
] as const;

export default function EnterprisePage() {
  const wired = wiredProviders();
  const zdrEndpoints = allModels().reduce(
    (n, m) => n + m.endpoints.filter((e) => e.zdr).length,
    0,
  );
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const redis = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.REDIS_URL?.trim());
  const postgres = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <MarketingPageHeader title="Enterprise">
          Controles reales de privacidad, presupuesto y auditoría — no un “plan Enterprise”
          inventado ni sponsors de banco. Lo que ves acá ya corre en el gateway.
        </MarketingPageHeader>

        <div className="mb-10 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
            Live en esta instancia
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4">
            {[
              { k: "Labs wired", v: `${wired.length}/${NEXUS_PROVIDERS.length}` },
              { k: "ZDR endpoints", v: String(zdrEndpoints) },
              {
                k: "Infra",
                v: [postgres && "pg", stripe && "stripe", redis && "redis"].filter(Boolean).join(" · ") ||
                  "mínimo",
              },
              { k: "Mode", v: wired.length ? "live hops" : "local echo" },
            ].map((row, i) => (
              <div
                key={row.k}
                className={`px-4 py-3 ${i ? "border-t border-zinc-100 lg:border-l lg:border-t-0" : ""}`}
              >
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">{row.k}</div>
                <div className="mt-1 font-[family-name:var(--font-syne)] text-lg font-semibold text-zinc-900">
                  {row.v}
                </div>
              </div>
            ))}
          </div>
        </div>

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
            <Link href="/docs/provider-routing">Docs ZDR / routing</Link>
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
