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
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/models" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Catálogo
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950">{model.name}</h1>
        <p className="mt-1 font-mono text-amber-700">{model.id}</p>
        <p className="mt-4 text-zinc-600">{model.description}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
            <Link href={`/chat?model=${encodeURIComponent(model.id)}`}>Probar en chat</Link>
          </Button>
          <Button asChild variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100">
            <Link href={`/chat?model=${encodeURIComponent(model.id)}&compare=nexus/auto`}>
              Comparar con auto
            </Link>
          </Button>
        </div>
        <dl className="mt-8 grid gap-3 text-sm">
          <div className="flex justify-between border-b border-zinc-200 py-2">
            <dt className="text-zinc-500">Contexto</dt>
            <dd>{model.contextLength.toLocaleString()} tokens</dd>
          </div>
          <div className="flex justify-between border-b border-zinc-200 py-2">
            <dt className="text-zinc-500">Precio / 1M</dt>
            <dd>
              {model.free
                ? "Gratis"
                : `${formatUsd(usdPerMillion(model.pricing.prompt), 2)} prompt · ${formatUsd(usdPerMillion(model.pricing.completion), 2)} completion`}
            </dd>
          </div>
          <div className="flex justify-between border-b border-zinc-200 py-2">
            <dt className="text-zinc-500">Modalidad</dt>
            <dd>{model.architecture.modality}</dd>
          </div>
          <div className="flex justify-between border-b border-zinc-200 py-2">
            <dt className="text-zinc-500">Parámetros</dt>
            <dd className="max-w-[60%] text-right font-mono text-xs text-zinc-500">
              {model.supportedParameters.join(" · ")}
            </dd>
          </div>
        </dl>
        <h2 className="mt-10 text-lg font-medium">Labs</h2>
        <div className="mt-3 grid gap-2">
          {model.endpoints.length ? (
            model.endpoints.map((e) => (
              <div
                key={`${e.adapter}-${e.providerModel}`}
                className="flex justify-between border-t border-zinc-200 py-2 text-sm"
              >
                <span className="font-mono text-amber-700">{e.adapter}</span>
                <span className="text-zinc-500">
                  {e.providerModel}
                  {e.zdr ? " · ZDR" : ""}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">Router Nexus — no llama a un lab directo.</p>
          )}
        </div>
        <pre className="mt-10 overflow-x-auto border border-zinc-200 bg-white p-4 text-xs text-zinc-700">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -d '{"model":"${model.id}","messages":[{"role":"user","content":"Hola"}]}'`}
        </pre>
      </div>
    </MarketingShell>
  );
}
