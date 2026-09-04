import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, Boxes, Database, ExternalLink, Layers3, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { canReadHubCollection, collectionManager, findHubCollection, listHubCollectionItems } from "@/lib/hub/collection-store";

export const dynamic = "force-dynamic";

const icons = { model: Layers3, dataset: Database, space: Boxes } as const;

export default async function CollectionPage({ params }: { params: Promise<{ namespace: string; slug: string }> }) {
  const { namespace, slug } = await params;
  const session = await getSession();
  const auth = session?.user ? await sessionAuthContext(session.user.id) : null;
  const collection = await findHubCollection(namespace, slug);
  if (!collection || !canReadHubCollection(collection, auth)) notFound();
  const [items, manager] = await Promise.all([listHubCollectionItems(collection, auth), collectionManager(auth, collection)]);

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <nav className="mb-5 flex items-center gap-2 font-mono text-xs text-zinc-500"><Link href="/collections" className="hover:text-indigo-700">collections</Link><span>/</span><span>{collection.namespace}</span><span>/</span><span className="text-zinc-900">{collection.slug}</span></nav>
        <header className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white shadow-[0_16px_60px_rgba(17,19,38,0.07)]">
          <div className="nexus-console-grid bg-[#0b0e1a] px-6 py-7 text-white md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5"><div><div className="flex items-center gap-2 font-mono text-xs text-cyan-300"><Bookmark className="size-4" />{collection.namespace}/{collection.slug}{collection.namespaceVerified ? <ShieldCheck className="size-4" aria-label="Namespace verificado" /> : null}</div><h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight">{collection.title}</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{collection.description || "Selección curada de recursos IA en Nexus."}</p></div>{manager ? <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href={`/settings/collections/${collection.namespace}/${collection.slug}`}>Gestionar</Link></Button> : null}</div>
          </div>
          <div className="grid gap-px bg-zinc-200 sm:grid-cols-3">{[["Recursos visibles", items.length], ["Modelos", items.filter((item) => item.type === "model").length], ["Datasets + Spaces", items.filter((item) => item.type !== "model").length]].map(([label, value]) => <div key={String(label)} className="bg-white px-5 py-4"><div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{label}</div><div className="mt-1 font-mono text-xl text-zinc-800">{value}</div></div>)}</div>
        </header>

        <section className="mt-6 overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
          <div className="divide-y divide-zinc-100">
            {items.map((item, index) => { const Icon = icons[item.type]; return <Link key={item.id} href={item.href} className="group grid gap-3 px-5 py-5 transition hover:bg-indigo-50/35 sm:grid-cols-[2rem_2.25rem_minmax(0,1fr)_auto] sm:items-center"><span className="font-mono text-xs text-zinc-400">{String(index + 1).padStart(2, "0")}</span><span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon className="size-4" /></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-zinc-950">{item.title}</span><span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500">{item.type}</span></span><span className="mt-1 block truncate font-mono text-[11px] text-indigo-600">{item.path}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{item.note || item.description || "Recurso publicado en Nexus."}</span></span><ExternalLink className="size-4 text-zinc-300 transition group-hover:text-indigo-500" /></Link>; })}
            {!items.length ? <div className="px-6 py-16 text-center"><Bookmark className="mx-auto size-7 text-indigo-300" /><h2 className="mt-3 font-semibold text-zinc-900">Esta colección todavía está vacía</h2><p className="mt-1 text-sm text-zinc-500">El responsable puede agregar modelos, datasets y Spaces desde su panel.</p></div> : null}
          </div>
        </section>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Nexus vuelve a validar la visibilidad de cada recurso al cargar la colección. Los elementos privados nunca se exponen a identidades sin acceso.</p>
      </div>
    </MarketingShell>
  );
}
