import Link from "next/link";
import { ArrowRight, Check, Code2, Gauge, ShieldCheck, Workflow } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { allModels, executableEndpoints, featuredModels, usdPerMillion } from "@/lib/catalog";
import { CREDIT_PURCHASE_FEE, CREDIT_PURCHASE_MIN_FEE_USD } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";
import { getSession } from "@/lib/auth";
import { formatUsd } from "@/lib/money";

const ROUTE_PROVIDERS = [
  { name: "Anthropic", model: "Claude", color: "bg-orange-300" },
  { name: "Google", model: "Gemini", color: "bg-blue-400" },
  { name: "Mistral", model: "Mistral", color: "bg-rose-400" },
  { name: "Together", model: "Llama · Qwen", color: "bg-cyan-400" },
] as const;

function GatewayConsole({ executableProviderCount }: { executableProviderCount: number }) {
  return (
    <div className="nexus-console-grid relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0e1a] p-4 text-white shadow-2xl shadow-indigo-950/25 sm:p-6">
      <div aria-hidden className="absolute -right-20 -top-24 size-64 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
          Router operativo
        </div>
        <span className="font-mono text-[10px] text-cyan-300">POST /v1/responses</span>
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Solicitud</div>
          <div className="mt-3 font-mono text-xs leading-6 text-zinc-300">
            <div><span className="text-fuchsia-300">model</span>: <span className="text-cyan-200">&quot;nexus/auto&quot;</span></div>
            <div><span className="text-fuchsia-300">input</span>: multimodal</div>
            <div><span className="text-fuchsia-300">zdr</span>: <span className="text-emerald-300">true</span></div>
            <div><span className="text-fuchsia-300">strategy</span>: price · latency</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["Responses", "Chat", "Messages"].map((protocol) => (
              <span key={protocol} className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[9px] text-zinc-400">
                {protocol}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {ROUTE_PROVIDERS.map((provider, index) => (
            <div
              key={provider.name}
              className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 ${
                index === 1
                  ? "border-indigo-400/40 bg-indigo-400/10"
                  : "border-white/10 bg-white/[0.035]"
              }`}
            >
              {index === 1 ? (
                <span aria-hidden className="nexus-route-pulse absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-cyan-300/15 to-transparent" />
              ) : null}
              <span className={`relative size-2 rounded-full ${provider.color}`} />
              <div className="relative min-w-0 flex-1">
                <div className="text-xs font-medium text-zinc-100">{provider.name}</div>
                <div className="truncate font-mono text-[9px] text-zinc-500">{provider.model}</div>
              </div>
              <span className={`relative font-mono text-[9px] uppercase ${index === 1 ? "text-emerald-300" : "text-zinc-500"}`}>
                {index === 1 ? "seleccionado" : "fallback"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 divide-x divide-white/10 rounded-xl border border-white/10 bg-black/20 py-3 text-center">
        <div>
          <div className="font-mono text-sm text-white">{executableProviderCount}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">rutas verificadas</div>
        </div>
        <div>
          <div className="font-mono text-sm text-white">ZDR</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">fail-closed</div>
        </div>
        <div>
          <div className="font-mono text-sm text-white">reserve→settle</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">ledger</div>
        </div>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const session = await getSession();
  const models = allModels().filter((model) => !model.id.startsWith("nexus/"));
  const featured = featuredModels(8).filter((model) => !model.id.startsWith("nexus/")).slice(0, 4);
  const executableProviderIds = new Set(
    models.flatMap((model) => executableEndpoints(model).map((endpoint) => endpoint.adapter)),
  );
  const executableModels = models.filter((model) => executableEndpoints(model).length > 0).length;
  const fee = (CREDIT_PURCHASE_FEE * 100).toFixed(0);

  return (
    <div className="nexus-grid min-h-screen overflow-hidden bg-[#f8f9ff] text-zinc-900">
      <SiteHeader tone="light" />

      <main>
        <section className="relative">
          <div aria-hidden className="absolute inset-x-0 top-0 h-[38rem] bg-[radial-gradient(circle_at_16%_14%,rgba(99,102,241,0.16),transparent_34%),radial-gradient(circle_at_82%_30%,rgba(6,182,212,0.12),transparent_28%)]" />
          <div className="relative mx-auto grid max-w-[90rem] items-center gap-12 px-4 pb-16 pt-16 sm:px-6 md:pb-24 md:pt-24 lg:grid-cols-[0.88fr_1.12fr] lg:px-8">
            <div className="max-w-2xl">
              <div className="nexus-hero-brand inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.17em] text-indigo-700 shadow-sm">
                <span className="size-1.5 rounded-full bg-cyan-500" />
                Infraestructura neutral · multi‑IA
              </div>
              <h1 className="nexus-hero-copy mt-6 font-[family-name:var(--font-syne)] text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[#101225] sm:text-6xl lg:text-7xl">
                Una red de IA.
                <span className="nexus-signal-text block">Todas las rutas bajo control.</span>
              </h1>
              <p className="nexus-hero-copy mt-6 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg">
                Descubrí y ejecutá modelos de OpenAI, Anthropic, Google, Mistral, Meta, Qwen,
                DeepSeek y decenas de proveedores desde una API, un saldo y una capa de gobierno.
              </p>
              <div className="nexus-hero-cta mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-11 rounded-full px-5 shadow-lg shadow-indigo-500/20">
                  <Link href={session ? "/overview" : "/register"}>
                    {session ? "Abrir consola" : "Empezar con Nexus"}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 rounded-full border-indigo-200 bg-white/75 px-5">
                  <Link href="/models">Explorar catálogo</Link>
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
                {["Sin recargo por token", "BYOK disponible", "ZDR verificable"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <Check aria-hidden className="size-3.5 text-emerald-600" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <GatewayConsole executableProviderCount={executableProviderIds.size} />
          </div>
        </section>

        <section className="border-y border-indigo-950/10 bg-white/75 backdrop-blur">
          <div className="mx-auto grid max-w-[90rem] grid-cols-2 divide-x divide-y divide-indigo-950/10 px-4 sm:px-6 md:grid-cols-4 md:divide-y-0 lg:px-8">
            {[
              { value: `${models.length}+`, label: "modelos en catálogo", detail: "abiertos y propietarios" },
              { value: `${NEXUS_PROVIDERS.length}`, label: "proveedores compatibles", detail: "una capa de acceso" },
              { value: `${executableModels}`, label: "modelos ejecutables", detail: "tarifa verificada" },
              { value: `${fee}%`, label: "comisión de recarga", detail: `mínimo ${formatUsd(CREDIT_PURCHASE_MIN_FEE_USD, 2)}` },
            ].map((stat) => (
              <div key={stat.label} className="px-4 py-7 first:pl-0 md:px-7">
                <div className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-[#111326]">{stat.value}</div>
                <div className="mt-1 text-xs font-medium text-zinc-700">{stat.label}</div>
                <div className="mt-0.5 text-[10px] text-zinc-400">{stat.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-600">Control plane</div>
              <h2 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-[-0.035em] text-[#111326] sm:text-4xl">
                No es otro wrapper. Es la capa operativa de tu IA.
              </h2>
              <p className="mt-4 text-sm leading-6 text-zinc-600">
                Nexus separa descubrimiento, ejecución, privacidad y finanzas para que cada solicitud
                tenga una ruta explicable y cada dólar un movimiento auditable.
              </p>
              <Link href="/docs/provider-routing" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:text-indigo-900">
                Ver cómo enruta Nexus <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: Workflow, title: "Routing y fallback", copy: "Ordená proveedores por precio, latencia o preferencia. Bloqueá el fallback cuando necesitás determinismo." },
                { icon: ShieldCheck, title: "Privacidad fail‑closed", copy: "ZDR, allowlists, guardrails y políticas por workspace. Si la garantía no se puede probar, la ruta no sale." },
                { icon: Gauge, title: "Costos en tiempo real", copy: "Reserva antes de ejecutar y liquida el uso real después. Presupuestos, límites y trazabilidad por tenant." },
                { icon: Code2, title: "Tres protocolos, una clave", copy: "Chat Completions, Responses y Anthropic Messages con streaming, tools y contenido multimodal." },
              ].map(({ icon: Icon, title, copy }) => (
                <div key={title} className="nexus-surface rounded-2xl border border-indigo-100 bg-white/90 p-5">
                  <div className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                    <Icon aria-hidden className="size-4.5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-[#16182a]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-indigo-950/10 bg-[#0b0e1a] text-white">
          <div className="nexus-console-grid mx-auto max-w-[90rem] px-4 py-20 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300">Model hub</div>
                <h2 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">Elegí por capacidad, no por proveedor.</h2>
                <p className="mt-2 max-w-2xl text-sm text-zinc-400">Precios comparables, modalidades, contexto, parámetros y rutas disponibles en una ficha verificable.</p>
              </div>
              <Link href="/models" className="inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:text-cyan-200">
                Ver {models.length} modelos <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {featured.map((model) => {
                const endpointCount = executableEndpoints(model).length;
                return (
                  <Link key={model.id} href={`/models/${model.id}`} className="group rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition-all hover:-translate-y-0.5 hover:border-indigo-400/50 hover:bg-white/[0.07]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">{model.author}</span>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] text-zinc-400">{model.architecture.modality}</span>
                    </div>
                    <div className="mt-4 text-lg font-semibold text-white group-hover:text-indigo-200">{model.name}</div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-zinc-400">{model.description}</p>
                    <div className="mt-5 flex items-end justify-between border-t border-white/10 pt-4">
                      <div className="font-mono text-[10px] text-zinc-400">
                        {model.free ? "Gratis" : `${formatUsd(usdPerMillion(model.pricing.prompt), 2)} entrada / 1M`}
                      </div>
                      <div className="text-[10px] text-emerald-300">{endpointCount} ruta{endpointCount === 1 ? "" : "s"}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[90rem] px-4 py-20 sm:px-6 lg:px-8">
          <div className="nexus-surface relative overflow-hidden rounded-[2rem] border border-indigo-100 bg-white p-7 sm:p-10">
            <div aria-hidden className="nexus-signal absolute inset-x-0 top-0 h-1" />
            <div className="grid items-center gap-10 lg:grid-cols-[1fr_0.78fr]">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-indigo-600">Finanzas transparentes</div>
                <h2 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-[#111326]">Suscripción para operar. Créditos para consumir.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
                  Pagá el precio de lista del modelo. Nexus cobra {fee}% al recargar saldo, con un mínimo de {formatUsd(CREDIT_PURCHASE_MIN_FEE_USD, 2)}. Stripe Checkout habilita Link y los métodos elegibles sin guardar datos de tarjeta en Nexus.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild className="rounded-full px-5"><Link href="/credits">Ver planes y recargas</Link></Button>
                  <Button asChild variant="outline" className="rounded-full border-indigo-200"><Link href="/enterprise">Nexus para empresas</Link></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["0%", "recargo sobre tokens"],
                  [`${fee}%`, "al cargar saldo"],
                  ["Pro", "límites ampliados"],
                  ["Team", "roles y workspaces"],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
                    <div className="font-[family-name:var(--font-syne)] text-2xl font-semibold text-[#15172b]">{value}</div>
                    <div className="mt-1 text-xs text-zinc-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter tone="light" />
    </div>
  );
}
