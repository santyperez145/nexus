import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { Button } from "@/components/ui/button";
import { allModels } from "@/lib/catalog";

const CAPS = [
  {
    t: "Control sobre tus datos",
    d: "Aplicá políticas de no retención y bloqueá cualquier proveedor que no las cumpla.",
    href: "/settings/privacy",
  },
  {
    t: "Políticas centralizadas",
    d: "Definí qué modelos puede usar cada equipo y establecé límites antes de ejecutar una solicitud.",
    href: "/settings/guardrails",
  },
  {
    t: "Presupuestos por proyecto",
    d: "Separá costos, asigná presupuestos y seguí el consumo de cada espacio de trabajo.",
    href: "/settings/workspaces",
  },
  {
    t: "Actividad auditable",
    d: "Revisá solicitudes, costos y eventos; conectá alertas verificables a tus sistemas.",
    href: "/settings/observability",
  },
  {
    t: "Equipos y permisos",
    d: "Invitá personas, asigná responsabilidades y mantené cada proyecto correctamente aislado.",
    href: "/settings/organizations",
  },
  {
    t: "Integraciones seguras",
    d: "Conectá herramientas internas y aplicaciones sin compartir credenciales permanentes.",
    href: "/settings/oauth",
  },
  {
    t: "Tus proveedores, una política",
    d: "Usá cuentas existentes de modelos sin perder visibilidad ni control central.",
    href: "/settings/byok",
  },
  {
    t: "Continuidad de servicio",
    d: "Cambiá automáticamente entre proveedores compatibles cuando una opción no está disponible.",
    href: "/docs/provider-routing",
  },
] as const;

export default function EnterprisePage() {
  const models = allModels();

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <MarketingPageHeader title="Nexus para equipos">
          Unificá el acceso a modelos de IA con presupuesto, seguridad y visibilidad compartida
          desde el primer proyecto.
        </MarketingPageHeader>

        <div className="mb-10 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 md:flex md:items-center md:justify-between md:gap-8">
          <div>
            <div className="text-lg font-semibold text-zinc-950">Empezá con Team</div>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-600">Espacios compartidos, roles, límites de gasto y saldo mensual incluido. Sin contrato anual obligatorio.</p>
          </div>
          <Button asChild className="mt-5 shrink-0 md:mt-0">
            <Link href="/register">Crear espacio de equipo</Link>
          </Button>
        </div>

        <div className="mb-10 grid gap-3 sm:grid-cols-3">
          {[
            { k: "Modelos disponibles", v: `${models.length}+` },
            { k: "Una integración", v: "Todos los modelos" },
            { k: "Texto y multimedia", v: "Una sola cuenta" },
          ].map((row) => (
            <div key={row.k} className="rounded-xl border border-zinc-200 bg-white px-4 py-4">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">{row.k}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">{row.v}</div>
            </div>
          ))}
        </div>

        <div className="mb-5">
          <h2 className="text-xl font-semibold text-zinc-950">Gobierno sin fricción</h2>
          <p className="mt-1 text-sm text-zinc-500">Controles claros para quienes construyen, administran y pagan.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CAPS.map((c) => (
            <Link
              key={c.t}
              href={c.href}
              className="rounded-2xl border border-zinc-200 bg-white px-5 py-5 transition-all hover:border-violet-200 hover:shadow-[0_10px_30px_rgba(24,24,27,0.05)]"
            >
              <div className="text-lg font-semibold text-zinc-900">
                {c.t}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{c.d}</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 border-t border-zinc-200 pt-8">
          <h2 className="text-xl font-semibold text-zinc-900">
            Transparencia operativa
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
            <li>La disponibilidad de cada modelo también depende de su proveedor.</li>
            <li>Las métricas públicas se basan en actividad real, nunca en datos demostrativos.</li>
            <li>Los niveles de servicio personalizados requieren un acuerdo explícito.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/credits">Ver plan Team</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
            <Link href="/chat">Probar Nexus</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900">
            <Link href="/docs">Documentación técnica</Link>
          </Button>
        </div>
      </div>
    </MarketingShell>
  );
}
