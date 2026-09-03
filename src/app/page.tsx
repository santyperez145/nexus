import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { RoutingViz } from "@/components/brand/routing-viz";
import { allModels, featuredModels, usdPerMillion } from "@/lib/catalog";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";
import { getSession } from "@/lib/auth";
import { formatUsd } from "@/lib/money";
import { connectionStatus } from "@/lib/connections";

export default async function HomePage() {
  const session = await getSession();
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
  const featured = featuredModels(8).filter((m) => !m.id.startsWith("nexus/")).slice(0, 3);
  const labs = NEXUS_PROVIDERS.length;
  const fee = (CREDIT_PURCHASE_FEE * 100).toFixed(1);
  const wiredIds = connectionStatus()
    .providers.filter((p) => p.wired)
    .map((p) => p.id);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <SiteHeader tone="light" />

      <section className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center md:pt-28">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl md:leading-[1.08]">
          Todos los modelos de IA en un solo lugar
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-zinc-500 md:text-lg">
          Compará, probá y usá los mejores modelos con precios transparentes, privacidad configurable
          y continuidad automática entre proveedores.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-10 rounded-full px-5">
            <Link href={session ? "/overview" : "/register"}>
              {session ? "Abrir panel" : "Crear cuenta"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-10 rounded-full px-5">
            <Link href="/models">Explorar modelos</Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-zinc-100">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4">
          {[
            { n: `${models.length}+`, l: "Modelos" },
            { n: `${labs}+`, l: "Proveedores" },
            { n: "0%", l: "Recargo por uso" },
            { n: `${fee}%`, l: "Comisión al cargar" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-2xl font-semibold tabular-nums text-zinc-950 md:text-3xl">{s.n}</div>
              <div className="mt-1 text-xs text-zinc-500 md:text-sm">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: "/models",
              t: "Texto, imágenes, video y audio",
              d: "Creá cualquier experiencia desde una sola interfaz y un catálogo seleccionado.",
              cta: "Ver catálogo",
            },
            {
              href: "/docs/provider-routing",
              t: "Mayor disponibilidad",
              d: "Si un proveedor falla, Nexus puede continuar con otra opción compatible.",
              cta: "Conocer más",
            },
            {
              href: "/credits",
              t: "Precio y rendimiento",
              d: `Sin recargo por uso. La comisión de ${fee}% aparece únicamente al cargar saldo.`,
              cta: "Ver precios",
            },
            {
              href: "/docs",
              t: "Privacidad a tu medida",
              d: "Elegí proveedores sin retención, restringí modelos y decidí qué actividad guardar.",
              cta: "Ver privacidad",
            },
          ].map((card) => (
            <Link
              key={card.t}
              href={card.href}
              className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300 hover:bg-zinc-50/60"
            >
              <div className="text-base font-semibold text-zinc-950">{card.t}</div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-500">{card.d}</p>
              <span className="mt-4 text-sm text-violet-700">{card.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-zinc-100 bg-zinc-50/50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Siempre la mejor ruta disponible</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              Ejecutá un mismo modelo en distintos proveedores y mantené tu producto funcionando
              cuando una opción no responde.
            </p>
            <Link href="/providers" className="mt-4 inline-block text-sm text-violet-700 hover:underline">
              Ver proveedores →
            </Link>
          </div>
          <RoutingViz className="w-full max-w-lg" wired={wiredIds} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Modelos destacados</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {models.length} modelos disponibles en {labs} proveedores compatibles.
            </p>
          </div>
          <Link href="/models" className="text-sm text-violet-700 hover:underline">
            Ver todos
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featured.map((m) => (
            <Link
              key={m.id}
              href={`/models/${m.id}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
            >
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">por {m.author}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950">{m.name}</div>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{m.description}</p>
              <div className="mt-4 font-mono text-xs text-zinc-500">
                {m.free
                  ? "Gratis"
                  : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / ${formatUsd(usdPerMillion(m.pricing.completion), 2)} · 1M`}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-zinc-100">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-3">
          {[
            {
              t: "Creá tu cuenta",
              d: "Empezá en minutos y sumá a tu equipo cuando lo necesites.",
            },
            {
              t: "Cargá saldo",
              d: "Usalo con cualquier modelo. La comisión se cobra al cargar, no por token.",
            },
            {
              t: "Conectá tu producto",
              d: "Creá una clave y empezá a usar Nexus con herramientas compatibles con OpenAI.",
            },
          ].map((step) => (
            <div key={step.t}>
              <h3 className="text-base font-semibold text-zinc-950">{step.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter tone="light" />
    </div>
  );
}
