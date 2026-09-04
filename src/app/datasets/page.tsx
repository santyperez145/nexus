import Link from "next/link";
import { Database, Download, GitCommitHorizontal, LockKeyhole, ShieldCheck } from "lucide-react";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { ensureDb } from "@/lib/db";
import { listDatasetRepositories } from "@/lib/hub/repository-store";

export const dynamic = "force-dynamic";

export default async function DatasetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; task?: string; tag?: string }>;
}) {
  await ensureDb();
  const filters = await searchParams;
  const [datasets, allPublic] = await Promise.all([
    listDatasetRepositories({
      query: filters.q,
      task: filters.task,
      tag: filters.tag,
      limit: 100,
    }),
    listDatasetRepositories({ limit: 100 }),
  ]);
  const revisions = allPublic.reduce((sum, item) => sum + item.latestRevision, 0);
  const downloads = allPublic.reduce((sum, item) => sum + item.downloads, 0);

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.09),_transparent_68%)]" />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <MarketingPageHeader title="Hub de datasets" className="mb-0">
            Publicá, versioná y distribuí datos para evaluación, ajuste y agentes. Los recursos
            privados y gated respetan la misma identidad y aislamiento tenant del gateway.
          </MarketingPageHeader>
          <Button asChild className="mb-1 rounded-full px-4">
            <Link href="/settings/datasets">Crear dataset</Link>
          </Button>
        </div>

        <section className="nexus-console-grid mt-8 overflow-hidden rounded-2xl border border-indigo-950/15 bg-[#0b0e1a] text-white shadow-[0_18px_70px_rgba(17,19,38,0.14)]">
          <div className="grid gap-px bg-white/10 sm:grid-cols-3">
            {[
              ["Repositorios públicos", allPublic.length.toLocaleString(), Database],
              ["Revisiones inmutables", revisions.toLocaleString(), GitCommitHorizontal],
              ["Descargas servidas", downloads.toLocaleString(), Download],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="bg-[#0b0e1a]/95 px-5 py-5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  <Icon className="size-3.5 text-cyan-300" />
                  {label as string}
                </div>
                <div className="mt-2 font-mono text-2xl text-zinc-100">{value as string}</div>
              </div>
            ))}
          </div>
        </section>

        <form className="mt-7 grid gap-3 rounded-2xl border border-indigo-950/10 bg-white p-3 shadow-sm sm:grid-cols-[1fr_13rem_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Buscar por nombre, namespace o tema…"
            aria-label="Buscar datasets"
            className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <input
            name="task"
            defaultValue={filters.task}
            placeholder="Tarea, ej. embeddings"
            aria-label="Filtrar por tarea"
            className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <Button type="submit" className="h-10 px-5">Filtrar</Button>
        </form>

        <div className="mt-5 grid gap-3">
          {datasets.map((dataset) => (
            <Link
              key={dataset.id}
              href={`/datasets/${dataset.namespace}/${dataset.slug}`}
              className="group grid gap-4 rounded-2xl border border-indigo-950/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_15px_40px_rgba(17,19,38,0.07)] md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-indigo-600">{dataset.namespace}/</span>
                  <h2 className="truncate text-base font-semibold text-[#111326]">{dataset.slug}</h2>
                  {dataset.namespaceVerified ? (
                    <ShieldCheck className="size-4 text-cyan-600" aria-label="Namespace verificado" />
                  ) : null}
                  {dataset.gated ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                      <LockKeyhole className="size-3" /> gated
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium text-zinc-800">{dataset.title}</p>
                <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-relaxed text-zinc-500">
                  {dataset.description || "Repositorio listo para publicar su primera ficha de datos."}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {dataset.task ? <span className="rounded-md bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">{dataset.task}</span> : null}
                  {dataset.tags.slice(0, 5).map((tag) => (
                    <span key={tag} className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-5 border-t border-zinc-100 pt-3 font-mono text-[11px] text-zinc-500 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <span>rev {dataset.latestRevision}</span>
                <span>{dataset.downloads.toLocaleString()} ↓</span>
                <span className="text-indigo-600 transition-transform group-hover:translate-x-0.5">Abrir →</span>
              </div>
            </Link>
          ))}
          {!datasets.length ? (
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-6 py-16 text-center">
              <Database className="mx-auto size-7 text-indigo-300" />
              <h2 className="mt-3 font-semibold text-zinc-900">No hay datasets para este filtro</h2>
              <p className="mt-1 text-sm text-zinc-500">Probá otra búsqueda o publicá el primer recurso.</p>
            </div>
          ) : null}
        </div>
      </div>
    </MarketingShell>
  );
}
