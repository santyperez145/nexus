import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { CostEstimator } from "@/components/models/cost-estimator";
import { allModels, findModel, usdPerMillion } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";
import { wiredProviders } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function ModelDetailPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const id = slug.join("/");
  const model = findModel(id);
  if (!model) notFound();

  const live = new Set(wiredProviders().map((p) => p.id));
  const related = allModels()
    .filter((m) => m.author === model.author && m.id !== model.id && !m.id.startsWith("nexus/"))
    .slice(0, 8);

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-48 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.12),_transparent_70%)]"
        />
        <Link href="/models" className="relative text-sm text-zinc-500 hover:text-zinc-900">
          ← Catálogo
        </Link>
        <h1 className="relative mt-4 font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          {model.name}
        </h1>
        <p className="relative mt-2 font-mono text-sm text-amber-700">{model.id}</p>
        <div className="relative mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-zinc-600">
            {model.architecture.modality}
          </span>
          {model.free ? (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
              free
            </span>
          ) : null}
          {model.knowledgeCutoff ? (
            <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-zinc-600">
              cutoff {model.knowledgeCutoff}
            </span>
          ) : null}
          {model.huggingFaceId ? (
            <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-zinc-500">
              HF {model.huggingFaceId}
            </span>
          ) : null}
          <Link
            href={`/providers`}
            className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-amber-800 hover:underline"
          >
            author {model.author}
          </Link>
        </div>
        <p className="relative mt-5 max-w-2xl text-base leading-relaxed text-zinc-600">
          {model.description}
        </p>
        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
            <Link href={`/chat?model=${encodeURIComponent(model.id)}`}>Probar en chat</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={`/chat?model=${encodeURIComponent(model.id)}&compare=nexus/auto`}>
              Comparar con auto
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={`/compare?a=${encodeURIComponent(model.id)}`}>Ficha compare</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={`/arena?a=${encodeURIComponent(model.id)}`}>Arena</Link>
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
            <dt className="text-zinc-500">Input</dt>
            <dd className="font-mono text-xs text-zinc-600">
              {model.architecture.inputModalities.join(" · ")}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-zinc-100 px-4 py-2.5">
            <dt className="text-zinc-500">Output</dt>
            <dd className="font-mono text-xs text-zinc-600">
              {model.architecture.outputModalities.join(" · ")}
            </dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="shrink-0 text-zinc-500">Parámetros</dt>
            <dd className="max-w-[70%] text-right font-mono text-xs text-zinc-500">
              {model.supportedParameters.join(" · ")}
            </dd>
          </div>
        </dl>

        <div className="mt-8">
          <CostEstimator
            promptPerM={usdPerMillion(model.pricing.prompt)}
            completionPerM={usdPerMillion(model.pricing.completion)}
            free={model.free}
          />
        </div>

        <h2 className="mt-10 font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
          Endpoints
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Hosts que pueden servir este slug. Wired = key en esta instancia (plataforma o BYOK).
        </p>
        {model.endpoints.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <div className="min-w-[44rem]">
              <div className="grid grid-cols-[7rem_1fr_4.5rem_4.5rem_4rem_3.5rem_3.5rem_3.5rem] gap-2 border-b border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-zinc-500">
                <span>Adapter</span>
                <span>Upstream</span>
                <span className="text-right">$/1M in</span>
                <span className="text-right">$/1M out</span>
                <span className="text-right">Lat</span>
                <span className="text-right">TPS</span>
                <span className="text-right">Quant</span>
                <span className="text-right">Wire</span>
              </div>
              {model.endpoints.map((e, i) => {
                const on = live.has(e.adapter);
                return (
                  <div
                    key={`${e.adapter}-${e.providerModel}`}
                    className={`grid grid-cols-[7rem_1fr_4.5rem_4.5rem_4rem_3.5rem_3.5rem_3.5rem] items-center gap-2 px-3 py-2.5 text-sm ${
                      i ? "border-t border-zinc-100" : ""
                    } ${i % 2 ? "bg-zinc-50/40" : ""}`}
                  >
                    <Link
                      href={`/providers/${e.adapter}`}
                      className="font-mono text-amber-700 hover:underline"
                    >
                      {e.adapter}
                    </Link>
                    <span className="truncate font-mono text-xs text-zinc-500">{e.providerModel}</span>
                    <span className="text-right tabular-nums text-xs text-zinc-600">
                      {formatUsd(usdPerMillion(e.pricing.prompt), 2)}
                    </span>
                    <span className="text-right tabular-nums text-xs text-zinc-600">
                      {formatUsd(usdPerMillion(e.pricing.completion), 2)}
                    </span>
                    <span className="text-right tabular-nums text-xs text-zinc-600">{e.latencyMs}ms</span>
                    <span className="text-right tabular-nums text-xs text-zinc-600">{e.throughputTps}</span>
                    <span className="text-right font-mono text-[10px] text-zinc-500">
                      {e.quantization || "—"}
                    </span>
                    <span
                      className={`text-right text-[10px] ${on ? "text-emerald-700" : "text-zinc-400"}`}
                      title={e.zdr ? "ZDR" : "standard"}
                    >
                      {on ? "●" : "○"}
                      {e.zdr ? "Z" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
            Router Nexus — no llama a un lab directo.
          </p>
        )}

        {related.length ? (
          <section className="mt-10">
            <h2 className="font-[family-name:var(--font-syne)] text-xl font-semibold text-zinc-900">
              Más de {model.author}
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {related.map((m) => (
                <Link
                  key={m.id}
                  href={`/models/${m.id}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:border-amber-600/40"
                >
                  <div className="truncate font-medium text-zinc-900">{m.name}</div>
                  <div className="truncate font-mono text-[11px] text-zinc-500">{m.id}</div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <pre className="mt-10 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700">
{`# curl
curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -H "HTTP-Referer: https://tu-app.example" \\
  -H "X-Title: Tu App" \\
  -d '{"model":"${model.id}","messages":[{"role":"user","content":"Hola"}]}'

# nexus-sdk
import { Nexus } from "nexus-sdk";
const nexus = new Nexus({ apiKey: process.env.NEXUS_API_KEY });
await nexus.chat.send({ model: "${model.id}", messages: [{ role: "user", content: "Hola" }] });

# OpenAI SDK → Nexus
import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "$NEXUS_URL/api/v1",
  apiKey: process.env.NEXUS_API_KEY,
});
await client.chat.completions.create({
  model: "${model.id}",
  messages: [{ role: "user", content: "Hola" }],
});`}
        </pre>
      </div>
    </MarketingShell>
  );
}
