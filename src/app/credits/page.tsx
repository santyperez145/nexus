import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { Button } from "@/components/ui/button";
import { allModels } from "@/lib/catalog";
import { CREDIT_PACKS, CREDIT_PURCHASE_FEE, SUBSCRIPTION_PLANS } from "@/lib/config";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

export default function PublicCreditsPage() {
  const feePct = (CREDIT_PURCHASE_FEE * 100).toFixed(1);
  const freeModels = allModels().filter((m) => m.free && !m.id.startsWith("nexus/")).length;
  const planCopy: Record<string, string> = {
    pro: "Para crear, lanzar y escalar productos con más capacidad.",
    team: "Para equipos que necesitan colaborar, controlar gastos y crecer juntos.",
  };

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.12),_transparent_70%)]"
        />
        <MarketingPageHeader title="Precios simples y transparentes">
          Pagá el precio publicado de cada modelo. Sin recargos por token, mínimos mensuales ni
          contratos obligatorios.
        </MarketingPageHeader>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { t: "Sin recargo por uso", d: "El precio por token coincide con el publicado en el catálogo." },
            { t: `${feePct}% al cargar`, d: "Una única comisión visible al comprar saldo." },
            { t: "Tus propias cuentas", d: "Conectá proveedores que ya usás y mantené el control." },
          ].map((c) => (
            <div key={c.t} className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
              <div className="text-lg font-semibold text-zinc-900">
                {c.t}
              </div>
              <p className="mt-1 text-sm text-zinc-500">{c.d}</p>
            </div>
          ))}
        </div>

        <h2 className="mb-3 text-xl font-semibold text-zinc-900">Elegí cómo querés usar Nexus</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Los planes agregan capacidad, colaboración y saldo mensual. También podés empezar gratis
          y pagar únicamente lo que consumís.
        </p>
        <div className="mb-10 grid gap-3 md:grid-cols-2">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div key={plan.id} className={`relative rounded-2xl bg-white p-6 ${plan.id === "team" ? "border-2 border-violet-500 shadow-[0_16px_45px_rgba(99,102,241,0.12)]" : "border border-zinc-200"}`}>
              {plan.id === "team" ? <div className="absolute -top-3 left-5 rounded-full bg-violet-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">Más elegido por equipos</div> : null}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold text-zinc-950">{plan.name}</div>
                  <p className="mt-1 text-sm text-zinc-500">{planCopy[plan.id] ?? plan.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-zinc-950">${plan.monthlyUsd}</div>
                  <div className="text-xs text-zinc-500">/mes{plan.seats ? " por asiento" : ""}</div>
                </div>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-zinc-700">
                <li>✓ ${plan.includedCreditsUsd} de uso incluidos cada mes</li>
                <li>✓ {plan.id === "team" ? "Espacios compartidos y roles" : "Hasta 5 espacios de trabajo"}</li>
                <li>✓ Límites de gasto y actividad detallada</li>
              </ul>
              <Button asChild className="mt-4 w-full">
                <Link href="/settings/credits">Elegir {plan.name}</Link>
              </Button>
            </div>
          ))}
        </div>

        <h2 className="mb-3 text-xl font-semibold text-zinc-900">
          Cargá saldo cuando lo necesites
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          El monto que recibís y el total a pagar se muestran antes de confirmar. El saldo no vence.
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
                  <div className="text-2xl font-semibold text-zinc-900">
                    {p.label}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">Recibís {formatUsd(p.usd, 2)} de saldo</p>
                  <p className="mt-3 text-xs text-zinc-400">Total {formatUsd(charge, 2)} · comisión {formatUsd(fee, 2)}</p>
                </div>
                <Button asChild className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link href="/settings/credits">Elegir {p.label}</Link>
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50/80 px-5 py-5 text-sm text-zinc-600">
          <p>
            <strong className="font-medium text-zinc-900">¿Ya tenés cuenta con un proveedor?</strong>{" "}
            Conectala a Nexus para sumar una sola capa de seguridad, límites y seguimiento. El uso
            se factura en tu proveedor y Nexus aplica la tarifa indicada para esta modalidad.
          </p>
          <p className="mt-3">
            Hay {freeModels} modelos gratuitos para explorar antes de cargar saldo. Consultá la
            disponibilidad actual en{" "}
            <Link href="/status" className="text-violet-700 hover:underline">
              Estado del servicio
            </Link>
            .
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild className="bg-zinc-900 text-white hover:bg-zinc-800">
            <Link href="/register">Crear cuenta</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
            <Link href="/docs">Ver documentación</Link>
          </Button>
        </div>
      </div>
    </MarketingShell>
  );
}
