import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { NexusMark } from "@/components/brand/nexus-logo";
import { HeroMesh } from "@/components/brand/hero-mesh";
import { allModels, featuredModels, usdPerMillion } from "@/lib/catalog";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";
import { getSession } from "@/lib/auth";
import { formatUsd } from "@/lib/money";

export default async function HomePage() {
  const session = await getSession();
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
  const featured = featuredModels(3);
  const labs = NEXUS_PROVIDERS.length;
  const fee = (CREDIT_PURCHASE_FEE * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <SiteHeader tone="light" />
      <section className="relative isolate overflow-hidden">
        <HeroMesh className="pointer-events-none absolute inset-0 size-full min-h-[100%] text-amber-700" />
        <div className="relative mx-auto flex min-h-[78vh] max-w-4xl flex-col items-center justify-center px-4 py-24 text-center">
          <div className="nexus-hero-brand flex items-center justify-center gap-4 md:gap-5">
            <NexusMark className="size-14 shrink-0 text-amber-600 md:size-[4.25rem]" />
            <p className="font-[family-name:var(--font-geist-sans)] text-6xl font-semibold tracking-tight text-zinc-950 md:text-8xl">
              Nexus
            </p>
          </div>
          <h1 className="nexus-hero-copy mt-8 max-w-2xl text-2xl font-medium tracking-tight text-zinc-800 md:text-3xl">
            La interfaz unificada para cada modelo.
          </h1>
          <p className="nexus-hero-copy mt-4 max-w-lg text-zinc-500">
            Mejores{" "}
            <Link href="/models" className="text-zinc-800 underline decoration-zinc-300 underline-offset-4">
              precios
            </Link>
            , mejor{" "}
            <Link href="/providers" className="text-zinc-800 underline decoration-zinc-300 underline-offset-4">
              disponibilidad
            </Link>
            , sin suscripción.
          </p>
          <div className="nexus-hero-cta mt-10 flex flex-wrap justify-center gap-3">
            {session ? (
              <Button asChild size="lg" className="h-11 bg-amber-600 px-5 text-white hover:bg-amber-700">
                <Link href="/overview">Ir al dashboard</Link>
              </Button>
            ) : (
              <Button asChild size="lg" className="h-11 bg-amber-600 px-5 text-white hover:bg-amber-700">
                <Link href="/register">Obtener API key</Link>
              </Button>
            )}
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-11 border-zinc-300 bg-white px-5 text-zinc-900 hover:bg-zinc-100"
            >
              <Link href="/models">Descubrir modelos</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Disponibilidad</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-500">
          Un slug, varios labs. Si un host cae, el gateway prueba el siguiente.
        </p>
      </section>

      <section className="border-y border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Precio y performance</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-zinc-500">
            Precio de lista del laboratorio. Fee {fee}% solo al cargar créditos. 0% markup en
            inferencia.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Políticas de datos</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-500">
          ZDR, allow/block de labs y logging opt-in. El prompt no se guarda salvo que lo actives.
        </p>
        <p className="mt-6 text-center">
          <Link href="/privacy" className="text-amber-700 underline-offset-4 hover:underline">
            Ver privacidad
          </Link>
        </p>
      </section>

      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Modelos</h2>
              <p className="mt-2 text-zinc-500">
                {models.length} slugs en {labs} hosts. Sin volumen inventado.
              </p>
            </div>
            <Link href="/models" className="text-sm text-amber-700 hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="mt-10 grid gap-8">
            {featured.map((m) => (
              <Link
                key={m.id}
                href={`/models/${m.id}`}
                className="block border-t border-zinc-200 pt-5 hover:border-amber-600"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-lg font-medium">{m.name}</span>
                  <span className="text-sm text-zinc-500">
                    {m.free ? "Gratis" : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / 1M`}
                  </span>
                </div>
                <div className="font-mono text-xs text-amber-700/80">{m.id}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Empezar</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-500">
          Cuenta, créditos, key. Compatible con el SDK de OpenAI.
        </p>
        <ol className="mx-auto mt-12 grid max-w-3xl gap-10 md:grid-cols-3">
          <li>
            <div className="font-mono text-xs text-amber-700">01</div>
            <div className="mt-2 font-medium">Crear cuenta</div>
            <p className="mt-1 text-sm text-zinc-500">Incluye $1. El playground usa la sesión.</p>
          </li>
          <li>
            <div className="font-mono text-xs text-amber-700">02</div>
            <div className="mt-2 font-medium">Cargar créditos</div>
            <p className="mt-1 text-sm text-zinc-500">Un saldo para cualquier modelo o lab cableado.</p>
          </li>
          <li>
            <div className="font-mono text-xs text-amber-700">03</div>
            <div className="mt-2 font-medium">Pedir la key</div>
            <p className="mt-1 text-sm text-zinc-500">
              <code className="text-zinc-700">sk-nx-</code> contra <code className="text-zinc-700">/api/v1</code>.
            </p>
          </li>
        </ol>
      </section>

      <SiteFooter tone="light" />
    </div>
  );
}
