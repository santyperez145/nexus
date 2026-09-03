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
          The unified interface for every model
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-zinc-500 md:text-lg">
          Better prices, fail-closed ZDR, no subscriptions. Una API OpenAI-compatible con BYOK y
          routing propio.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-10 rounded-full px-5">
            <Link href={session ? "/overview" : "/register"}>
              {session ? "Open dashboard" : "Get API Key"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-10 rounded-full px-5">
            <Link href="/models">Discover Models</Link>
          </Button>
        </div>
      </section>

      <section className="border-y border-zinc-100">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4">
          {[
            { n: `${models.length}+`, l: "Models" },
            { n: `${labs}+`, l: "Providers" },
            { n: "0%", l: "Inference markup" },
            { n: `${fee}%`, l: "Credit load fee" },
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
              t: "Text, images, video, audio",
              d: "Generate anything through a single interface. Browse the curated catalog.",
              cta: "Browse all",
            },
            {
              href: "/docs/provider-routing",
              t: "Higher availability",
              d: "Un slug, varios labs. Si un host cae, el gateway prueba el siguiente.",
              cta: "Learn more",
            },
            {
              href: "/credits",
              t: "Price and performance",
              d: `Lista del laboratorio. Fee ${fee}% solo al cargar créditos. 0% markup en inferencia.`,
              cta: "Learn more",
            },
            {
              href: "/docs",
              t: "Custom data policies",
              d: "ZDR fail-closed, allow/block de labs y logging opt-in por cuenta.",
              cta: "View docs",
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
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Higher availability</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              Reliable models via distributed routing. Fall back to other providers when one goes
              down.
            </p>
            <Link href="/providers" className="mt-4 inline-block text-sm text-violet-700 hover:underline">
              Learn more →
            </Link>
          </div>
          <RoutingViz className="w-full max-w-lg" wired={wiredIds} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Featured models</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {models.length} models on {labs} providers. Sin volumen inventado.
            </p>
          </div>
          <Link href="/models" className="text-sm text-violet-700 hover:underline">
            View all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {featured.map((m) => (
            <Link
              key={m.id}
              href={`/models/${m.id}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-300"
            >
              <div className="text-[11px] uppercase tracking-wide text-zinc-400">by {m.author}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950">{m.name}</div>
              <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{m.description}</p>
              <div className="mt-4 font-mono text-xs text-zinc-500">
                {m.free
                  ? "Free"
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
              t: "Signup",
              d: "Create an account to get started. You can set up an org for your team later.",
            },
            {
              t: "Buy credits",
              d: "Credits can be used with any model or provider. Fee only on load, not per token.",
            },
            {
              t: "Get your API key",
              d: "Create an API key and start making requests. Fully OpenAI compatible.",
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
