import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { CostEstimator } from "@/components/models/cost-estimator";
import { allModels, findModel, usdPerMillion } from "@/lib/catalog";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd } from "@/lib/money";
import { wiredProviders } from "@/lib/providers/registry";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";

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

  let usage = { requests: 0, tokens: 0, avgLatency: null as number | null };
  try {
    await ensureDb();
    const [agg] = await db
      .select({
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${schema.generations.promptTokens} + ${schema.generations.completionTokens}), 0)`,
        avgLatency: sql<number | null>`avg(${schema.generations.latencyMs})`,
      })
      .from(schema.generations)
      .where(eq(schema.generations.routedModel, model.id));
    usage = {
      requests: Number(agg?.requests ?? 0),
      tokens: Number(agg?.tokens ?? 0),
      avgLatency: agg?.avgLatency != null ? Math.round(Number(agg.avgLatency)) : null,
    };
  } catch {
    /* db unavailable */
  }

  const maxLat = Math.max(1, ...model.endpoints.map((e) => e.latencyMs || 1));
  const vision = model.architecture.inputModalities.includes("image");
  const zdrCount = model.endpoints.filter(isEndpointZdrConfirmed).length;

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
        <h1 className="relative mt-4 text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          {model.name}
        </h1>
        <p className="relative mt-2 font-mono text-sm text-violet-700">{model.id}</p>
        <div className="relative mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-zinc-600">
            {model.architecture.modality}
          </span>
          {vision ? (
            <span className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-800">
              vision
            </span>
          ) : null}
          {model.free ? (
            <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">
              free
            </span>
          ) : null}
          {zdrCount ? (
            <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800">
              {zdrCount} ZDR host{zdrCount > 1 ? "s" : ""}
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
            href={`/models?author=${encodeURIComponent(model.author)}`}
            className="rounded border border-zinc-200 bg-white px-2 py-0.5 text-violet-800 hover:underline"
          >
            author {model.author}
          </Link>
        </div>
        <p className="relative mt-5 max-w-2xl text-base leading-relaxed text-zinc-600">
          {model.description}
        </p>
        <div className="relative mt-6 flex flex-wrap gap-2">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
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
        <p className="relative mt-3 text-xs text-zinc-500">
          Producción requiere autenticación y un provider o BYOK cableado; no genera respuestas simuladas.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Contexto</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {(model.contextLength / 1000).toFixed(0)}k
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Prompt / 1M</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {model.free ? "Gratis" : formatUsd(usdPerMillion(model.pricing.prompt), 2)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Completion / 1M</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {model.free ? "—" : formatUsd(usdPerMillion(model.pricing.completion), 2)}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Uso instancia</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
              {usage.requests ? usage.requests.toLocaleString() : "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-500">
              {usage.tokens
                ? `${usage.tokens.toLocaleString()} tok${usage.avgLatency != null ? ` · ${usage.avgLatency} ms avg` : ""}`
                : "sin samples aún"}
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

        <h2 className="mt-10 text-xl font-semibold text-zinc-900">
          Endpoints
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Hosts que pueden servir este slug. Wired = key en esta instancia. Barras = latencia de
          catálogo (relativa).
        </p>
        {model.endpoints.length ? (
          <div className="mt-4 space-y-2">
            {model.endpoints.map((e) => {
              const on = live.has(e.adapter);
              const bar = Math.max(8, ((e.latencyMs || 1) / maxLat) * 100);
              return (
                <div
                  key={`${e.adapter}-${e.providerModel}`}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/providers/${e.adapter}`}
                        className="font-mono text-sm text-violet-700 hover:underline"
                      >
                        {e.adapter}
                      </Link>
                      <div className="truncate font-mono text-[11px] text-zinc-500">{e.providerModel}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {isEndpointZdrConfirmed(e) ? (
                        <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-sky-800">
                          ZDR
                        </span>
                      ) : null}
                      <span className={on ? "text-emerald-700" : "text-zinc-400"}>
                        {on ? "wired" : "unwired"}
                      </span>
                      <span className="tabular-nums text-zinc-600">{e.latencyMs} ms</span>
                      <span className="tabular-nums text-zinc-500">{e.throughputTps} tps</span>
                      <span className="font-mono text-zinc-400">{e.quantization || "—"}</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-violet-500/45" style={{ width: `${bar}%` }} />
                  </div>
                  <div className="mt-2 flex gap-4 text-xs tabular-nums text-zinc-500">
                    <span>in {formatUsd(usdPerMillion(e.pricing.prompt), 2)}/1M</span>
                    <span>out {formatUsd(usdPerMillion(e.pricing.completion), 2)}/1M</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-sm text-zinc-500">
            Router Nexus — no llama a un lab directo.
          </p>
        )}

        {related.length ? (
          <section className="mt-10">
            <h2 className="text-xl font-semibold text-zinc-900">
              Más de {model.author}
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {related.map((m) => (
                <Link
                  key={m.id}
                  href={`/models/${m.id}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:border-zinc-300"
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

# demo local de desarrollo (deshabilitada en producción)
curl $NEXUS_URL/api/v1/chat/completions \\
  -H "X-Nexus-Guest: 1" \\
  -d '{"model":"${model.id}","messages":[{"role":"user","content":"ping"}]}'

# nexus-sdk
import { Nexus } from "nexus-sdk";
const nexus = new Nexus({ apiKey: process.env.NEXUS_API_KEY });
await nexus.chat.send({ model: "${model.id}", messages: [{ role: "user", content: "Hola" }] });`}
        </pre>
      </div>
    </MarketingShell>
  );
}
