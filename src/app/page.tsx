import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { NexusMark } from "@/components/brand/nexus-logo";
import { allModels, featuredModels, usdPerMillion } from "@/lib/catalog";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";
import { getSession } from "@/lib/auth";
import { formatUsd } from "@/lib/money";

export default async function HomePage() {
  const session = await getSession();
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
  const featured = featuredModels(6);
  const labs = NEXUS_PROVIDERS.length;
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(245,158,11,0.14),_transparent_42%),linear-gradient(180deg,#09090b,#0c0a09)]">
      <SiteHeader />
      <section className="mx-auto flex min-h-[78vh] max-w-6xl flex-col justify-center px-4 py-20">
        <div className="nexus-hero-brand flex items-center gap-4 md:gap-6">
          <NexusMark className="size-14 shrink-0 text-amber-400 md:size-[4.5rem]" />
          <p className="font-[family-name:var(--font-geist-sans)] text-6xl font-semibold tracking-tight text-white md:text-8xl">
            Nexus
          </p>
        </div>
        <h1 className="nexus-hero-copy mt-6 max-w-2xl text-2xl font-medium text-zinc-200 md:text-3xl">
          Una API. Todos los modelos. Vos controlás los tokens.
        </h1>
        <p className="nexus-hero-copy mt-4 max-w-xl text-zinc-400">
          Gateway OpenAI-compatible: routing, fallbacks, créditos, BYOK y búsqueda web. El lab es
          un detalle de infraestructura.
        </p>
        <div className="nexus-hero-cta mt-8 flex flex-wrap gap-3">
          {session ? (
            <Button asChild size="lg">
              <Link href="/overview">Ir al dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link href="/register">Empezar con $1</Link>
            </Button>
          )}
          <Button asChild size="lg" variant="outline">
            <Link href="/models">Ver modelos</Link>
          </Button>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="mb-3 text-xl font-medium">Cómo se usa</h2>
        <p className="mb-8 max-w-xl text-zinc-500">
          Misma secuencia que cualquier unified API: cuenta, créditos, key. Fee{" "}
          {(CREDIT_PURCHASE_FEE * 100).toFixed(1)}% al cargar. 0% markup en inferencia.
        </p>
        <ol className="grid max-w-3xl gap-8 text-zinc-400 md:grid-cols-3">
          <li>
            <div className="font-mono text-xs text-amber-400/80">01</div>
            <div className="mt-1 text-white">Crear cuenta</div>
            <p className="mt-1 text-sm">Incluye $1. El playground usa la sesión, no hace falta key.</p>
          </li>
          <li>
            <div className="font-mono text-xs text-amber-400/80">02</div>
            <div className="mt-1 text-white">Cargar créditos</div>
            <p className="mt-1 text-sm">Stripe o wallet manual. Un saldo, todos los labs cableados.</p>
          </li>
          <li>
            <div className="font-mono text-xs text-amber-400/80">03</div>
            <div className="mt-1 text-white">Pedir una key</div>
            <p className="mt-1 text-sm">
              <code className="text-zinc-300">sk-nx-</code> contra <code className="text-zinc-300">/api/v1</code>.
            </p>
          </li>
        </ol>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="mb-3 text-xl font-medium">Llamada</h2>
        <p className="mb-6 max-w-xl text-zinc-500">
          SDK propio o el de OpenAI con otro baseURL. Alias <code>~openai/latest</code>.
        </p>
        <pre className="overflow-x-auto border border-white/10 bg-black/50 p-4 text-sm text-amber-100/90">
{`import { Nexus } from "nexus-sdk";

const nexus = new Nexus({
  apiKey: process.env.NEXUS_API_KEY,
  baseURL: "${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1",
});

const res = await nexus.chat.send({
  model: "~openai/latest",
  provider: { sort: "throughput", only: ["groq", "together"] },
  messages: [{ role: "user", content: "Hola" }],
});`}
        </pre>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <h2 className="mb-3 text-xl font-medium">Modelos</h2>
        <p className="mb-8 max-w-xl text-zinc-500">
          {models.length} slugs y {labs} hosts. Precio de lista del laboratorio, sin volumen inventado.
        </p>
        <div className="grid gap-6">
          {featured.map((m) => (
            <Link key={m.id} href={`/models/${m.id}`} className="block border-t border-white/10 pt-4 hover:border-amber-400/40">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-white">{m.name}</span>
                <span className="text-sm text-zinc-500">
                  {m.free
                    ? "Gratis"
                    : `${formatUsd(usdPerMillion(m.pricing.prompt), 2)} / 1M`}
                </span>
              </div>
              <div className="font-mono text-xs text-amber-400/80">{m.id}</div>
            </Link>
          ))}
        </div>
        <p className="mt-8">
          <Link href="/models" className="text-amber-400 hover:underline">
            Catálogo completo
          </Link>
        </p>
      </section>
      <SiteFooter />
    </div>
  );
}
