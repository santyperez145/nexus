import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { allModels } from "@/lib/catalog";
import { wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const wired = wiredProviders();
  const models = allModels().filter((m) => !m.id.startsWith("nexus/")).length;
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const redis = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.REDIS_URL?.trim());
  const postgres = Boolean(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim());
  const services = [
    { name: "API y cuentas", description: "Acceso, configuración y datos de tu cuenta", ok: postgres && redis },
    { name: "Modelos de IA", description: `${wired.length} proveedores disponibles para inferencia`, ok: wired.length > 0 },
    { name: "Pagos y suscripciones", description: "Compras de saldo y administración de planes", ok: stripe },
    { name: "Catálogo de modelos", description: `${models.toLocaleString()} modelos publicados`, ok: models > 0 },
  ];
  const operational = services.every((service) => service.ok);

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-3xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <MarketingPageHeader title="Estado del servicio">
          Disponibilidad actual de Nexus y sus funciones principales.
        </MarketingPageHeader>

        <div className={`mb-8 flex items-center gap-4 rounded-2xl border px-5 py-5 ${operational ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
          <span className={`h-3 w-3 shrink-0 rounded-full ${operational ? "bg-emerald-500" : "bg-amber-500"}`} />
          <div>
            <div className="text-lg font-semibold text-zinc-950">{operational ? "Servicios principales disponibles" : "Disponibilidad limitada"}</div>
            <p className="mt-0.5 text-sm text-zinc-600">Estado basado en las funciones configuradas en esta instalación.</p>
          </div>
        </div>

        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Servicios</h2>
        <div className="mb-10 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {services.map((service, i) => (
            <div
              key={service.name}
              className={`flex items-center justify-between gap-4 px-5 py-4 text-sm ${i ? "border-t border-zinc-100" : ""}`}
            >
              <div>
                <div className="font-medium text-zinc-900">{service.name}</div>
                <div className="mt-0.5 text-xs text-zinc-500">{service.description}</div>
              </div>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  service.ok
                    ? "border-emerald-600/30 bg-emerald-50 text-emerald-800"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {service.ok ? "Disponible" : "No disponible"}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 px-5 py-5">
          <div className="font-semibold text-zinc-900">¿Buscás un proveedor específico?</div>
          <p className="mt-1 text-sm text-zinc-600">Revisá el catálogo de proveedores para conocer modelos compatibles y opciones de conexión.</p>
          <Link href="/providers" className="mt-3 inline-block text-sm font-medium text-violet-700 hover:text-violet-800">Ver proveedores →</Link>
        </div>
      </div>
    </MarketingShell>
  );
}
