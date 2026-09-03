import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { CostEstimator } from "@/components/models/cost-estimator";
import { ModelArtwork } from "@/components/models/model-artwork";
import { allModels, findModel, usdPerMillion, type CatalogModel } from "@/lib/catalog";
import {
  isModelRouteSupported,
  modelAction,
  modelKind,
  modelKindLabel,
  type ModelKind,
} from "@/lib/catalog/presentation";
import { db, ensureDb, schema } from "@/lib/db";
import { formatUsd } from "@/lib/money";
import { wiredProviders } from "@/lib/providers/registry";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";
import { recentOperationalProviderIds } from "@/lib/providers/health-store";
import { MEDIA_PRICE_VERSION, quoteImage, quoteSpeech, quoteTranscription } from "@/lib/media/pricing";

export const dynamic = "force-dynamic";

type Usage = { requests: number; tokens: number; avgLatency: number | null };

function modelStats(model: CatalogModel, kind: ModelKind, usage: Usage, supported: boolean) {
  const requestUsage = {
    label: "Uso en esta instancia",
    value: usage.requests ? usage.requests.toLocaleString() : "—",
    detail: usage.requests
      ? usage.tokens
        ? `${usage.tokens.toLocaleString()} tokens${usage.avgLatency != null ? ` · ${usage.avgLatency} ms promedio` : ""}`
        : "solicitudes liquidadas"
      : "sin solicitudes registradas",
  };
  if (kind === "image") {
    const quote = quoteImage({ model: model.id, size: "1024x1024", quality: "medium", n: 1 });
    return [
      { label: "Modalidad", value: "Imagen", detail: "generación" },
      { label: "Precio base", value: quote ? formatUsd(quote.usd, 3) : "—", detail: "1024² · calidad media" },
      { label: "Variantes", value: "1–4", detail: "por solicitud" },
      requestUsage,
    ];
  }
  if (kind === "speech") {
    const quote = quoteSpeech({ model: model.id, characters: 1000 });
    return [
      { label: "Modalidad", value: "Voz", detail: "texto a audio" },
      { label: "Precio", value: quote ? formatUsd(quote.usd, 4) : "—", detail: "por 1.000 caracteres" },
      { label: "Límite", value: "4.096", detail: "caracteres por solicitud" },
      requestUsage,
    ];
  }
  if (kind === "transcription") {
    const quote = quoteTranscription({ model: model.id, durationSeconds: 60 });
    return [
      { label: "Modalidad", value: "Audio → texto", detail: "transcripción" },
      { label: "Precio", value: quote ? formatUsd(quote.usd, 4) : "—", detail: "por minuto medido" },
      { label: "Archivo", value: "25 MiB", detail: "máximo por solicitud" },
      requestUsage,
    ];
  }
  if (kind === "video") {
    return [
      { label: "Modalidad", value: "Video", detail: "generación asíncrona" },
      { label: "Precio base", value: supported && model.pricing.request ? formatUsd(model.pricing.request, 3) : "—", detail: "por trabajo aceptado" },
      { label: "Resultado", value: "Asíncrono", detail: "consultable por ID" },
      requestUsage,
    ];
  }
  if (kind === "embeddings") {
    return [
      { label: "Modalidad", value: "Vectores", detail: "embeddings" },
      { label: "Entrada / 1 M", value: supported ? formatUsd(usdPerMillion(model.pricing.prompt), 3) : "—", detail: "tokens estimados" },
      { label: "Contexto", value: `${Math.round(model.contextLength / 1000)}k`, detail: "tokens" },
      requestUsage,
    ];
  }
  return [
    { label: "Contexto", value: `${Math.round(model.contextLength / 1000)}k`, detail: "tokens" },
    { label: "Entrada / 1 M", value: model.free ? "Gratis" : formatUsd(usdPerMillion(model.pricing.prompt), 2), detail: "tokens" },
    { label: "Salida / 1 M", value: model.free ? "—" : formatUsd(usdPerMillion(model.pricing.completion), 2), detail: "tokens" },
    requestUsage,
  ];
}

function apiSample(id: string, kind: ModelKind) {
  const common = `curl $NEXUS_URL/api/v1`;
  if (kind === "image") {
    return [
      `${common}/images/generations \\`,
      `  -H "Authorization: Bearer $NEXUS_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model":"${id}","prompt":"Una interfaz de IA editorial","size":"1024x1024","quality":"medium"}'`,
    ].join("\n");
  }
  if (kind === "speech") {
    return [
      `${common}/audio/speech \\`,
      `  -H "Authorization: Bearer $NEXUS_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model":"${id}","input":"Hola desde Nexus","voice":"alloy"}' \\`,
      "  --output speech.mp3",
    ].join("\n");
  }
  if (kind === "transcription") {
    return [
      `${common}/audio/transcriptions \\`,
      `  -H "Authorization: Bearer $NEXUS_API_KEY" \\`,
      `  -F "model=${id}" \\`,
      `  -F "file=@audio.mp3"`,
    ].join("\n");
  }
  if (kind === "embeddings") {
    return [
      `${common}/embeddings \\`,
      `  -H "Authorization: Bearer $NEXUS_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model":"${id}","input":["gateway de modelos"]}'`,
    ].join("\n");
  }
  if (kind === "video") {
    return [
      `${common}/videos \\`,
      `  -H "Authorization: Bearer $NEXUS_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model":"${id}","prompt":"Una ciudad futurista al amanecer"}'`,
    ].join("\n");
  }
  return [
    `${common}/chat/completions \\`,
    `  -H "Authorization: Bearer $NEXUS_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"model":"${id}","messages":[{"role":"user","content":"Hola"}]}'`,
  ].join("\n");
}

export default async function ModelDetailPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const id = slug.join("/");
  const model = findModel(id);
  if (!model) notFound();

  const configured = new Set(wiredProviders().map((p) => p.id));
  let operational = new Set<string>();
  const related = allModels()
    .filter((m) => m.author === model.author && m.id !== model.id && !m.id.startsWith("nexus/"))
    .slice(0, 8);

  let usage = { requests: 0, tokens: 0, avgLatency: null as number | null };
  try {
    await ensureDb();
    operational = await recentOperationalProviderIds();
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
  const kind = modelKind({
    id: model.id,
    input: model.architecture.inputModalities,
    output: model.architecture.outputModalities,
  });
  const supported = isModelRouteSupported(kind, model.id);
  const action = modelAction(kind, model.id);
  const isTokenPriced = kind === "text" || kind === "embeddings";
  const stats = modelStats(model, kind, usage, supported);
  const sample = supported ? apiSample(model.id, kind) : null;

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
        <div className="relative mt-5 flex items-start gap-4 sm:gap-6">
          <ModelArtwork
            id={model.id}
            name={model.name}
            author={model.author}
            className="h-20 w-20 rounded-3xl sm:h-24 sm:w-24"
          />
          <div className="min-w-0 pt-1">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl md:text-5xl">
              {model.name}
            </h1>
            <p className="mt-2 break-all font-mono text-sm text-violet-700">{model.id}</p>
            <p className="mt-1 text-xs font-medium text-zinc-500">{modelKindLabel(kind)}</p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-zinc-600">
            {model.architecture.modality}
          </span>
          <span
            className={`rounded border px-2 py-0.5 ${
              supported
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-zinc-50 text-zinc-600"
            }`}
          >
            {supported ? "ruta Nexus" : "sólo catálogo"}
          </span>
          {vision ? (
            <span className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-800">
              vision
            </span>
          ) : null}
          {model.free && supported ? (
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
            <Link href={action.href}>{action.label}</Link>
          </Button>
          {kind === "text" ? (
            <>
              <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
                <Link href={`/compare?a=${encodeURIComponent(model.id)}`}>Comparar</Link>
              </Button>
              <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
                <Link href={`/arena?a=${encodeURIComponent(model.id)}`}>Arena</Link>
              </Button>
            </>
          ) : null}
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={kind === "text" ? "/docs/api" : "/docs/media"}>Ver documentación</Link>
          </Button>
        </div>
        <p className="relative mt-3 text-xs text-zinc-500">
          Las solicitudes reales requieren autenticación, saldo y un proveedor configurado. Nexus no muestra resultados simulados.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{stat.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{stat.value}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{stat.detail}</div>
            </div>
          ))}
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

        {isTokenPriced && supported ? (
          <div className="mt-8">
            <CostEstimator
              promptPerM={usdPerMillion(model.pricing.prompt)}
              completionPerM={usdPerMillion(model.pricing.completion)}
              free={model.free}
            />
          </div>
        ) : supported ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
            <div className="font-medium">Precio calculado antes de ejecutar</div>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
              Nexus reserva el costo máximo de esta modalidad y liquida el importe cotizado. La respuesta incluye el costo y la versión de tarifa {MEDIA_PRICE_VERSION}.
            </p>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
            <div className="font-medium">Disponible como ficha de catálogo</div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              La fuente de catálogo declara esta modalidad, pero Nexus todavía no tiene un adaptador y una tarifa verificadas para ejecutarla. No se la presenta como gratis ni se envían solicitudes a una ruta incompatible.
            </p>
          </div>
        )}

        <h2 className="mt-10 text-xl font-semibold text-zinc-900">
          Endpoints
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Hosts declarados para este slug. “Operativo” exige una prueba real reciente; “configurado” sólo confirma que existe una credencial.
        </p>
        {model.endpoints.length ? (
          <div className="mt-4 space-y-2">
            {model.endpoints.map((e) => {
              const isConfigured = configured.has(e.adapter);
              const isOperational = operational.has(e.adapter);
              const measured = !e.metricsEstimated && e.latencyMs > 0;
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
                      <span className={isOperational ? "text-emerald-700" : isConfigured ? "text-amber-700" : "text-zinc-400"}>
                        {isOperational ? "operativo" : isConfigured ? "configurado" : "sin configurar"}
                      </span>
                      {measured ? (
                        <>
                          <span className="tabular-nums text-zinc-600">{e.latencyMs} ms</span>
                          <span className="tabular-nums text-zinc-500">{e.throughputTps} tps</span>
                        </>
                      ) : (
                        <span className="text-zinc-400">sin telemetría medida</span>
                      )}
                      {e.quantization && e.quantization !== "unknown" ? (
                        <span className="font-mono text-zinc-400">{e.quantization}</span>
                      ) : null}
                    </div>
                  </div>
                  {measured ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-violet-500/45" style={{ width: `${bar}%` }} />
                    </div>
                  ) : null}
                  {isTokenPriced ? (
                    <div className="mt-2 flex gap-4 text-xs tabular-nums text-zinc-500">
                      <span>entrada {formatUsd(usdPerMillion(e.pricing.prompt), 2)}/1 M</span>
                      <span>salida {formatUsd(usdPerMillion(e.pricing.completion), 2)}/1 M</span>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-zinc-500">La tarifa se calcula por modalidad antes de reservar saldo.</div>
                  )}
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
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:border-zinc-300"
                >
                  <ModelArtwork id={m.id} name={m.name} author={m.author} className="h-10 w-10 rounded-xl" />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900">{m.name}</div>
                    <div className="truncate font-mono text-[11px] text-zinc-500">{m.id}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {sample ? (
          <pre className="mt-10 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700">
            {sample}
          </pre>
        ) : null}
      </div>
    </MarketingShell>
  );
}
