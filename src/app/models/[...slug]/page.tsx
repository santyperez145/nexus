import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { findModel, usdPerMillion } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";

export default async function ModelDetailPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const id = slug.join("/");
  const model = findModel(id);
  if (!model) notFound();
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <Link href="/models" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Catálogo
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
          {model.name}
        </h1>
        <p className="mt-1 font-mono text-amber-700">{model.id}</p>
        <p className="mt-4 max-w-2xl text-zinc-600">{model.description}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
            <Link href={`/chat?model=${encodeURIComponent(model.id)}`}>Probar en chat</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={`/chat?model=${encodeURIComponent(model.id)}&compare=nexus/auto`}>
              Comparar con auto
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={`/compare?a=${encodeURIComponent(model.id)}`}>
              Ficha compare
            </Link>
          </Button>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Contexto</div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tabular-nums text-zinc-900">
              {(model.contextLength / 1000).toFixed(0)}k
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Prompt / 1M</div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tabular-nums text-zinc-900">
              {model.free ? "Gratis" : formatUsd(usdPerMillion(model.pricing.prompt), 2)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Completion / 1M</div>
            <div className="mt-1 font-[family-name:var(--font-syne)] text-2xl font-semibold tabular-nums text-zinc-900">
              {model.free ? "—" : formatUsd(usdPerMillion(model.pricing.completion), 2)}
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-0 overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm">
          <div className="flex justify-between gap-4 border-b border-zinc-100 px-4 py-2.5">
            <dt className="text-zinc-500">Modalidad</dt>
            <dd>{model.architecture.modality}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="shrink-0 text-zinc-500">Parámetros</dt>
            <dd className="max-w-[70%] text-right font-mono text-xs text-zinc-500">
              {model.supportedParameters.join(" · ")}
            </dd>
          </div>
        </dl>

        <h2 className="mt-10 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
          Endpoints
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Hosts que pueden servir este slug. El router elige según precio, latencia y privacy.
        </p>
        {model.endpoints.length ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="grid grid-cols-[1fr_1fr_5rem_4.5rem_5rem] gap-2 border-b border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-zinc-500">
              <span>Adapter</span>
              <span>Upstream</span>
              <span className="text-right">Latency</span>
              <span className="text-right">TPS</span>
              <span className="text-right">Policy</span>
            </div>
            {model.endpoints.map((e, i) => (
              <div
                key={`${e.adapter}-${e.providerModel}`}
                className={`grid grid-cols-[1fr_1fr_5rem_4.5rem_5rem] items-center gap-2 px-3 py-2.5 text-sm ${
                  i ? "border-t border-zinc-100" : ""
                } ${i % 2 ? "bg-zinc-50/40" : ""}`}
              >
                <span className="font-mono text-amber-700">{e.adapter}</span>
                <span className="truncate font-mono text-xs text-zinc-500">{e.providerModel}</span>
                <span className="text-right tabular-nums text-zinc-600">{e.latencyMs}ms</span>
                <span className="text-right tabular-nums text-zinc-600">{e.throughputTps}</span>
                <span className="text-right text-xs text-zinc-500">{e.zdr ? "ZDR" : "std"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
            Router Nexus — no llama a un lab directo.
          </p>
        )}

        <pre className="mt-10 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -d '{"model":"${model.id}","messages":[{"role":"user","content":"Hola"}]}'`}
        </pre>
      </div>
    </MarketingShell>
  );
}
