import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { NexusMark } from "@/components/brand/nexus-logo";
import { HeroMesh } from "@/components/brand/hero-mesh";
import { RoutingViz } from "@/components/brand/routing-viz";
import { allModels, featuredModels, usdPerMillion } from "@/lib/catalog";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";
import { getSession } from "@/lib/auth";
import { formatUsd } from "@/lib/money";

export default async function HomePage() {
  const session = await getSession();
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
  const featured = featuredModels(5);
  const labs = NEXUS_PROVIDERS.length;
  const fee = (CREDIT_PURCHASE_FEE * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-[#fafaf9] text-zinc-900">
      <SiteHeader tone="light" />

      <section className="relative isolate min-h-[88vh] overflow-hidden">
        <HeroMesh className="pointer-events-none absolute inset-0 size-full text-amber-700" />
        <div className="nexus-grain absolute inset-0" aria-hidden />
        <div className="relative mx-auto flex min-h-[88vh] max-w-3xl flex-col items-center justify-center px-4 pb-24 pt-20 text-center">
          <div className="nexus-hero-brand flex items-center justify-center gap-3 md:gap-5">
            <NexusMark className="size-12 shrink-0 text-amber-600 md:size-16" />
            <p className="font-[family-name:var(--font-syne)] text-6xl font-semibold tracking-tight text-zinc-950 md:text-8xl">
              Nexus
            </p>
          </div>
          <h1 className="nexus-hero-copy mt-8 max-w-xl font-[family-name:var(--font-syne)] text-2xl font-medium tracking-tight text-zinc-800 md:text-[1.85rem] md:leading-snug">
            La interfaz unificada para cada modelo.
          </h1>
          <p className="nexus-hero-copy mt-4 max-w-md text-[15px] leading-relaxed text-zinc-500">
            Mejores precios, mejor disponibilidad, sin suscripción. Un slug, muchos labs.
          </p>
          <div className="nexus-hero-cta mt-10 flex flex-wrap justify-center gap-3">
            {session ? (
              <Button asChild size="lg" className="h-11 rounded-md bg-amber-600 px-6 text-white hover:bg-amber-700">
                <Link href="/overview">Ir al dashboard</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="h-11 rounded-md bg-amber-600 px-6 text-white hover:bg-amber-700">
                <Link href="/register">Obtener API key</Link>
              </Button>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 rounded-md border-zinc-300 bg-white/80 px-6 text-zinc-900 backdrop-blur hover:bg-white"
            >
              <Link href="/models">Descubrir modelos</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-200/80 bg-white/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-5 text-sm text-zinc-500">
          <Link href="/models?mod=text" className="hover:text-zinc-900">
            Texto
          </Link>
          <span className="text-zinc-300">·</span>
          <Link href="/models?mod=image" className="hover:text-zinc-900">
            Imagen
          </Link>
          <span className="text-zinc-300">·</span>
          <Link href="/models?mod=video" className="hover:text-zinc-900">
            Video
          </Link>
          <span className="text-zinc-300">·</span>
          <Link href="/models?mod=audio" className="hover:text-zinc-900">
            Audio
          </Link>
          <span className="text-zinc-300">·</span>
          <span className="font-mono text-xs text-zinc-400">
            {models.length} modelos · {labs} labs
          </span>
        </div>
      </section>

      <section className="nexus-section-in mx-auto max-w-5xl px-4 py-20 md:py-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
              Disponibilidad
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-500">
              Un slug, varios labs. Si un host cae, el gateway prueba el siguiente. Ordená por
              precio, latencia o throughput con <code className="text-zinc-700">provider</code>.
            </p>
            <p className="mt-6">
              <Link href="/providers" className="text-sm text-amber-700 underline-offset-4 hover:underline">
                Ver providers →
              </Link>
            </p>
          </div>
          <RoutingViz className="w-full max-w-lg justify-self-center md:justify-self-end" />
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-5xl gap-12 px-4 py-20 md:grid-cols-2 md:py-28">
          <div>
            <h2 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
              Precio y performance
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-zinc-500">
              Precio de lista del laboratorio. Fee {fee}% solo al cargar créditos. 0% markup en
              inferencia. Edge-friendly: una request, el host más apto.
            </p>
          </div>
          <pre className="overflow-x-auto border border-zinc-200 bg-[#fafaf9] p-4 text-left text-[12px] leading-relaxed text-zinc-700 md:text-[13px]">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -d '{
    "model": "openai/gpt-5",
    "provider": { "sort": "throughput", "allow_fallbacks": true },
    "messages": [{"role":"user","content":"Hola"}]
  }'`}
          </pre>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 md:py-28">
        <h2 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
          Políticas de datos
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-zinc-500">
          ZDR, allow/block de labs y logging opt-in. El prompt no se guarda salvo que lo actives en
          Settings. BYOK cifra tu key en reposo.
        </p>
        <div className="mt-10 grid gap-8 border-t border-zinc-200 pt-10 sm:grid-cols-3">
          {[
            { t: "ZDR", d: "Ruteá solo a labs que declaran retención cero." },
            { t: "Allow / block", d: "provider.only y provider.ignore por request." },
            { t: "Logging", d: "Opt-in. 1% de descuento si guardás prompts." },
          ].map((item) => (
            <div key={item.t}>
              <div className="font-medium text-zinc-900">{item.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-8">
          <Link href="/privacy" className="text-sm text-amber-700 underline-offset-4 hover:underline">
            Privacidad →
          </Link>
        </p>
      </section>

      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-20 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
                Modelos
              </h2>
              <p className="mt-2 text-zinc-500">
                {models.length} slugs en {labs} hosts. Sin volumen inventado.
              </p>
            </div>
            <Link href="/models" className="text-sm text-amber-700 hover:underline">
              Ver todos →
            </Link>
          </div>
          <div className="mt-12 grid gap-0">
            {featured.map((m) => (
              <Link
                key={m.id}
                href={`/models/${m.id}`}
                className="group flex flex-wrap items-baseline justify-between gap-2 border-t border-zinc-200 py-5 transition-colors hover:border-amber-600"
              >
                <div>
                  <div className="text-lg font-medium text-zinc-900 group-hover:text-zinc-950">{m.name}</div>
                  <div className="mt-0.5 font-mono text-xs text-amber-700/90">{m.id}</div>
                </div>
                <div className="text-sm text-zinc-500">
                  {m.free
                    ? "Gratis"
                    : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / ${formatUsd(usdPerMillion(m.pricing.completion), 2)} · 1M`}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20 md:py-28">
        <h2 className="text-center font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950">
          Empezar
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-zinc-500">
          Cuenta, créditos, key. Compatible con el SDK de OpenAI y con <code className="text-zinc-700">nexus-sdk</code>.
        </p>
        <ol className="mx-auto mt-14 grid max-w-4xl gap-12 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Crear cuenta",
              d: "Incluye $1. El playground usa la sesión; la key sk-nx- se revela una vez.",
            },
            {
              n: "02",
              t: "Cargar créditos",
              d: "Un saldo para cualquier modelo. Fee solo en la carga, no en cada token.",
            },
            {
              n: "03",
              t: "Llamar /api/v1",
              d: "Misma forma que OpenAI. Fallbacks, BYOK y usage.cost incluidos.",
            },
          ].map((step) => (
            <li key={step.n}>
              <div className="font-mono text-xs text-amber-700">{step.n}</div>
              <div className="mt-3 font-medium text-zinc-900">{step.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{step.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-14 flex justify-center">
          <Button asChild size="lg" className="h-11 rounded-md bg-amber-600 px-6 text-white hover:bg-amber-700">
            <Link href={session ? "/overview" : "/register"}>
              {session ? "Abrir dashboard" : "Crear cuenta"}
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter tone="light" />
    </div>
  );
}
