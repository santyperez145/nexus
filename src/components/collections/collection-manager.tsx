"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark, Eye, Layers3, Plus } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useRemoteData } from "@/lib/use-remote-data";

export type CollectionRow = {
  id: string;
  namespace: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  theme: "indigo" | "cyan" | "amber" | "emerald" | "rose" | "zinc";
  item_count: number;
  items: Array<{ id: string; type: "model" | "dataset" | "space"; path: string; title: string; note: string; position: number }>;
  access: { manager: boolean };
};

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

async function responseData<T>(response: Response) {
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Solicitud rechazada (${response.status})`);
  return json.data;
}

export function CollectionManager() {
  const router = useRouter();
  const [rows, reload, loadError] = useRemoteData<CollectionRow[]>("/api/v1/collections?mine=1&limit=100");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const collections = rows ?? [];

  return (
    <div>
      <AppPageHeader
        title="Colecciones"
        actions={<Button asChild size="sm" variant="outline"><Link href="/collections">Explorar directorio</Link></Button>}
      >
        Curá modelos ejecutables, repositorios, datasets y Spaces en listas ordenadas. Las colecciones respetan la identidad y visibilidad de cada recurso hijo.
      </AppPageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Colecciones", collections.length],
          ["Recursos visibles", collections.reduce((sum, row) => sum + row.item_count, 0)],
          ["Públicas", collections.filter((row) => row.visibility === "public").length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-indigo-950/10 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-xl text-zinc-900">{value}</div>
          </div>
        ))}
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
        <button type="button" onClick={() => setCreating((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-indigo-50/40" aria-expanded={creating}>
          <span><span className="font-semibold text-zinc-950">Nueva colección</span><span className="mt-0.5 block text-xs text-zinc-500">Publicá una selección con identidad propia y hasta 100 recursos.</span></span>
          <Plus className={`size-5 text-indigo-600 transition ${creating ? "rotate-45" : ""}`} />
        </button>
        {creating ? (
          <form
            className="grid gap-4 border-t border-zinc-200 bg-zinc-50/60 p-5 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage("Creando…");
              const values = new FormData(event.currentTarget);
              try {
                const created = await responseData<CollectionRow>(await fetch("/api/v1/collections", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    namespace: values.get("namespace"), slug: values.get("slug"), title: values.get("title"),
                    description: values.get("description"), visibility: values.get("visibility"), theme: values.get("theme"),
                  }),
                }));
                if (created) router.push(`/settings/collections/${created.namespace}/${created.slug}`);
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : "No se pudo crear la colección");
              }
            }}
          >
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Namespace<input name="namespace" required maxLength={100} placeholder="tu-equipo" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Slug<input name="slug" required maxLength={120} placeholder="frontier-stack" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Nombre visible<input name="title" required maxLength={120} placeholder="Frontier stack" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Descripción<textarea name="description" maxLength={5000} rows={3} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" className={field}><option value="public">Pública</option><option value="private">Privada</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Color<select name="theme" defaultValue="indigo" className={field}>{["indigo", "cyan", "amber", "emerald", "rose", "zinc"].map((theme) => <option key={theme} value={theme}>{theme}</option>)}</select></label>
            <div className="flex items-center gap-3 md:col-span-2"><Button type="submit">Crear colección</Button>{message ? <span className="text-sm text-zinc-600">{message}</span> : null}</div>
          </form>
        ) : null}
      </section>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}
      <div className="grid gap-3">
        {collections.map((collection) => (
          <div key={collection.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-950/10 bg-white p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Bookmark className="size-4 text-indigo-500" /><Link href={`/settings/collections/${collection.namespace}/${collection.slug}`} className="truncate font-mono text-sm font-semibold text-zinc-900 hover:text-indigo-700">{collection.path}</Link><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${collection.visibility === "private" ? "bg-zinc-200 text-zinc-700" : "bg-emerald-50 text-emerald-700"}`}>{collection.visibility}</span></div>
              <div className="mt-1 text-sm text-zinc-600">{collection.title}</div>
              <div className="mt-2 flex items-center gap-1 font-mono text-[11px] text-zinc-500"><Layers3 className="size-3" />{collection.item_count} recursos visibles</div>
            </div>
            <div className="flex items-center gap-1">
              {collection.visibility === "public" ? <Button asChild size="sm" variant="ghost"><Link href={`/collections/${collection.namespace}/${collection.slug}`}><Eye className="mr-1 size-3.5" />Abrir</Link></Button> : null}
              <Button asChild size="sm" variant="outline"><Link href={`/settings/collections/${collection.namespace}/${collection.slug}`}>{collection.access.manager ? "Gestionar" : "Ver"}</Link></Button>
              {collection.access.manager ? <ConfirmAction triggerLabel="Eliminar" title={`Eliminar ${collection.path}`} description="Se eliminará la colección, no los modelos, datasets o Spaces incluidos." confirmLabel="Eliminar colección" onConfirm={async () => { await responseData(await fetch(`/api/v1/collections/${collection.namespace}/${collection.slug}`, { method: "DELETE" })); reload(); }} /> : null}
            </div>
          </div>
        ))}
        {rows && !collections.length ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-5 py-14 text-center text-sm text-zinc-500">Todavía no creaste colecciones. Armá la primera selección desde el formulario.</div> : null}
      </div>
    </div>
  );
}
