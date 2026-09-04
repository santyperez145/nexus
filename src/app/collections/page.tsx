import Link from "next/link";
import { Bookmark, Boxes, Database, Layers3, Search, ShieldCheck } from "lucide-react";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { ensureDb } from "@/lib/db";
import { listHubCollectionItems, listHubCollections, publicHubCollection } from "@/lib/hub/collection-store";
import { normalizeCollectionItemPath } from "@/lib/hub/collections";

export const dynamic = "force-dynamic";

const themeClass = {
  indigo: "from-indigo-500 to-violet-500",
  cyan: "from-cyan-500 to-blue-500",
  amber: "from-amber-400 to-orange-500",
  emerald: "from-emerald-400 to-teal-500",
  rose: "from-rose-400 to-pink-500",
  zinc: "from-zinc-500 to-zinc-700",
} as const;

export default async function CollectionsPage({ searchParams }: { searchParams: Promise<{ q?: string; owner?: string; item?: string }> }) {
  await ensureDb();
  const filters = await searchParams;
  let itemFilter: string | null = null;
  try { itemFilter = filters.item ? normalizeCollectionItemPath(filters.item) : null; } catch { itemFilter = null; }
  const rows = await listHubCollections({ query: filters.q, owner: filters.owner, limit: 100 });
  const catalog = await allRuntimeModels();
  const hydrated = await Promise.all(rows.map(async (collection) => publicHubCollection(collection, await listHubCollectionItems(collection, null, catalog))));
  const collections = hydrated.filter((collection) => !itemFilter || collection.items.some((item) => item.path === itemFilter));
  const totalItems = collections.reduce((sum, collection) => sum + collection.item_count, 0);

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-8 h-44 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.10),_transparent_68%)]" />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <MarketingPageHeader title="Colecciones Nexus" className="mb-0">Selecciones curadas de modelos multi‑proveedor, datasets versionados y Spaces ejecutables. Unificá descubrimiento, evaluación y operación sin perder el aislamiento de cada recurso.</MarketingPageHeader>
          <Button asChild className="mb-1 rounded-full px-4"><Link href="/settings/collections">Crear colección</Link></Button>
        </div>

        <section className="nexus-console-grid mt-8 overflow-hidden rounded-2xl border border-indigo-950/15 bg-[#0b0e1a] text-white shadow-[0_18px_70px_rgba(17,19,38,0.14)]">
          <div className="grid gap-px bg-white/10 sm:grid-cols-3">
            {([
              ["Colecciones públicas", collections.length, Bookmark],
              ["Recursos indexados", totalItems, Layers3],
              ["Tipos conectados", 3, Boxes],
            ] as const).map(([label, value, Icon]) => <div key={label} className="bg-[#0b0e1a]/95 px-5 py-5"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500"><Icon className="size-3.5 text-cyan-300" />{label}</div><div className="mt-2 font-mono text-2xl text-zinc-100">{value.toLocaleString()}</div></div>)}
          </div>
        </section>

        <form className="mt-7 grid gap-3 rounded-2xl border border-indigo-950/10 bg-white p-3 shadow-sm sm:grid-cols-[1fr_13rem_15rem_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Buscar colecciones…" aria-label="Buscar colecciones" className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <input name="owner" defaultValue={filters.owner} placeholder="namespace" aria-label="Filtrar por namespace" className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <input name="item" defaultValue={filters.item} placeholder="recurso namespace/slug" aria-label="Filtrar por recurso" className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <Button type="submit" className="h-10"><Search className="mr-1 size-4" />Filtrar</Button>
        </form>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {collections.map((collection) => (
            <Link key={collection.id} href={`/collections/${collection.namespace}/${collection.slug}`} className="group overflow-hidden rounded-2xl border border-indigo-950/10 bg-white transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_15px_40px_rgba(17,19,38,0.07)]">
              <div className={`h-1.5 bg-gradient-to-r ${themeClass[collection.theme]}`} />
              <div className="p-5">
                <div className="flex items-center gap-2 font-mono text-xs text-indigo-600"><Bookmark className="size-4" /><span className="truncate">{collection.path}</span>{collection.namespace_verified ? <ShieldCheck className="size-4 shrink-0 text-cyan-600" aria-label="Namespace verificado" /> : null}</div>
                <h2 className="mt-4 text-lg font-semibold text-[#111326]">{collection.title}</h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-relaxed text-zinc-500">{collection.description || "Selección curada en Nexus."}</p>
                <div className="mt-5 grid gap-2">
                  {collection.items.slice(0, 3).map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-2"><span className="rounded bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500 ring-1 ring-zinc-200">{item.type}</span><span className="truncate font-mono text-[11px] text-zinc-700">{item.path}</span></div>)}
                  {!collection.items.length ? <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-5 text-center text-xs text-zinc-400">Colección vacía</div> : null}
                </div>
                <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500"><span>{collection.item_count} recursos</span><span className="flex items-center gap-3"><span className="flex items-center gap-1"><Database className="size-3" />datasets</span><span className="flex items-center gap-1"><Boxes className="size-3" />Spaces</span></span></div>
              </div>
            </Link>
          ))}
          {!collections.length ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-6 py-16 text-center md:col-span-2"><Bookmark className="mx-auto size-7 text-indigo-300" /><h2 className="mt-3 font-semibold text-zinc-900">No hay colecciones para este filtro</h2><p className="mt-1 text-sm text-zinc-500">Probá otra búsqueda o publicá una nueva selección.</p></div> : null}
        </div>
      </div>
    </MarketingShell>
  );
}
