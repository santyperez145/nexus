import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { NexusMark } from "@/components/brand/nexus-logo";
import { allModels } from "@/lib/catalog";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";

export default function HomePage() {
  const models = allModels().filter((m) => !m.id.startsWith("nexus/"));
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
          <Button asChild size="lg">
            <Link href="/register">Empezar con $1</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/docs">Ver la API</Link>
          </Button>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm text-amber-100/90">
{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1",
  apiKey: process.env.NEXUS_API_KEY,
});

const res = await client.chat.completions.create({
  model: "meta-llama/llama-3.3-70b-instruct",
  provider: { sort: "throughput", only: ["groq", "together"] },
  messages: [{ role: "user", content: "Hola" }],
});`}
        </pre>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <h2 className="mb-3 text-xl font-medium">Por qué existe</h2>
        <p className="mb-8 max-w-2xl text-zinc-500">
          Misma función que un unified API de modelos: un key, failover entre labs, y el precio de
          lista del laboratorio. Fee {((CREDIT_PURCHASE_FEE) * 100).toFixed(1)}% solo al cargar
          créditos. 0% markup en inferencia.
        </p>
        <div className="grid gap-6 text-sm text-zinc-400 md:grid-cols-3">
          <div>
            <div className="text-2xl font-semibold text-white">{models.length}+</div>
            modelos en catálogo propio + discovery de cada lab cableado
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">{labs}</div>
            hosts de inferencia (Groq, Together, Fireworks, Azure, Bedrock…)
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">:online</div>
            server tools de búsqueda, datetime y fetch sobre cualquier modelo
          </div>
        </div>
      </section>
    </div>
  );
}
