import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/site-header";
import { findModel, usdPerMillion } from "@/lib/catalog";
import { formatUsd } from "@/lib/money";

export default async function ModelDetailPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const id = slug.join("/");
  const model = findModel(id);
  if (!model) notFound();
  return (
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/models" className="text-sm text-zinc-500 hover:text-white">
          ← Catálogo
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-white">{model.name}</h1>
        <p className="mt-1 font-mono text-amber-400/80">{model.id}</p>
        <p className="mt-4 text-zinc-400">{model.description}</p>
        <dl className="mt-8 grid gap-3 text-sm">
          <div className="flex justify-between border-b border-white/10 py-2">
            <dt className="text-zinc-500">Contexto</dt>
            <dd>{model.contextLength.toLocaleString()} tokens</dd>
          </div>
          <div className="flex justify-between border-b border-white/10 py-2">
            <dt className="text-zinc-500">Precio / 1M</dt>
            <dd>
              {model.free
                ? "Gratis"
                : `${formatUsd(usdPerMillion(model.pricing.prompt), 2)} prompt · ${formatUsd(usdPerMillion(model.pricing.completion), 2)} completion`}
            </dd>
          </div>
          <div className="flex justify-between border-b border-white/10 py-2">
            <dt className="text-zinc-500">Modalidad</dt>
            <dd>{model.architecture.modality}</dd>
          </div>
        </dl>
        <h2 className="mt-10 text-lg font-medium">Labs</h2>
        <div className="mt-3 grid gap-2">
          {model.endpoints.length ? (
            model.endpoints.map((e) => (
              <div key={`${e.adapter}-${e.providerModel}`} className="flex justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
                <span className="font-mono text-amber-400/80">{e.adapter}</span>
                <span className="text-zinc-500">{e.providerModel}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">Router Nexus — no llama a un lab directo.</p>
          )}
        </div>
        <pre className="mt-10 overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-zinc-400">
{`curl $NEXUS_URL/api/v1/chat/completions \\
  -H "Authorization: Bearer $NEXUS_API_KEY" \\
  -d '{"model":"${model.id}","messages":[{"role":"user","content":"Hola"}]}'`}
        </pre>
      </div>
    </div>
  );
}
