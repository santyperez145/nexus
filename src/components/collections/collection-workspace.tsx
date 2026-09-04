"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Layers3, Trash2 } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";
import type { CollectionRow } from "./collection-manager";

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

async function responseMessage(response: Response) {
  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Solicitud rechazada (${response.status})`);
}

export function CollectionWorkspace({ namespace, slug }: { namespace: string; slug: string }) {
  const path = `/api/v1/collections/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}`;
  const itemPath = `${path}/items`;
  const [collection, reload, loadError] = useRemoteData<CollectionRow>(path);
  const [message, setMessage] = useState<string | null>(null);

  async function mutateItems(method: string, body?: unknown, query = "") {
    setMessage("Aplicando cambios…");
    try {
      await responseMessage(await fetch(`${itemPath}${query}`, {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      }));
      setMessage("Cambios guardados.");
      reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "No se pudo actualizar la colección");
    }
  }

  if (loadError) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>;
  if (!collection) return <div className="text-sm text-zinc-500">Cargando colección…</div>;

  return (
    <div>
      <AppPageHeader title={collection.title} actions={<Button asChild size="sm" variant="outline"><Link href={`/collections/${namespace}/${slug}`}>Abrir colección <ExternalLink className="ml-1 size-3.5" /></Link></Button>}>
        <span className="font-mono text-xs">{collection.path}</span> · {collection.item_count}/100 recursos visibles para tu identidad.
      </AppPageHeader>

      {!collection.access.manager ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Tenés acceso de lectura a este workspace. Sólo un owner o admin puede modificar la colección.</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          <form
            className="grid gap-4 rounded-2xl border border-indigo-950/10 bg-white p-5 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage("Guardando…");
              const values = new FormData(event.currentTarget);
              try {
                await responseMessage(await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: values.get("title"), description: values.get("description"), visibility: values.get("visibility"), theme: values.get("theme") }) }));
                setMessage("Cambios guardados.");
                reload();
              } catch (reason) { setMessage(reason instanceof Error ? reason.message : "No se pudo guardar"); }
            }}
          >
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Nombre<input name="title" required disabled={!collection.access.manager} maxLength={120} defaultValue={collection.title} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Descripción<textarea name="description" disabled={!collection.access.manager} maxLength={5000} rows={3} defaultValue={collection.description} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" disabled={!collection.access.manager} defaultValue={collection.visibility} className={field}><option value="public">Pública</option><option value="private">Privada</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Color<select name="theme" disabled={!collection.access.manager} defaultValue={collection.theme} className={field}>{["indigo", "cyan", "amber", "emerald", "rose", "zinc"].map((theme) => <option key={theme} value={theme}>{theme}</option>)}</select></label>
            <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" disabled={!collection.access.manager}>Guardar perfil</Button>{message ? <span className="text-sm text-zinc-600">{message}</span> : null}</div>
          </form>

          <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold text-zinc-950"><Layers3 className="size-4 text-indigo-500" />Recursos ordenados</h2><p className="mt-1 text-xs text-zinc-500">Sólo aparecen elementos que tu identidad puede leer; la visibilidad se vuelve a comprobar en cada consulta.</p></div>
            <div className="divide-y divide-zinc-100">
              {collection.items.map((item, index) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="w-7 font-mono text-xs text-zinc-400">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-indigo-700">{item.type}</span><Link href={item.type === "model" ? `/models/${item.path}` : item.type === "dataset" ? `/datasets/${item.path}` : `/spaces/${item.path}`} className="truncate font-mono text-xs font-semibold text-zinc-800 hover:text-indigo-700">{item.path}</Link></div>
                    <form className="mt-2 flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void mutateItems("PATCH", { id: item.id, note: values.get("note") }); }}>
                      <input name="note" disabled={!collection.access.manager} maxLength={500} defaultValue={item.note} placeholder="Nota editorial opcional" aria-label={`Nota de ${item.path}`} className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs outline-none focus:border-indigo-400" />
                      {collection.access.manager ? <Button type="submit" size="sm" variant="outline">Guardar nota</Button> : null}
                    </form>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" aria-label="Subir" disabled={!collection.access.manager || index === 0} onClick={() => { const ids = collection.items.map((row) => row.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void mutateItems("PUT", { item_ids: ids }); }}><ArrowUp className="size-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Bajar" disabled={!collection.access.manager || index === collection.items.length - 1} onClick={() => { const ids = collection.items.map((row) => row.id); [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]]; void mutateItems("PUT", { item_ids: ids }); }}><ArrowDown className="size-3.5" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label="Quitar" disabled={!collection.access.manager} onClick={() => void mutateItems("DELETE", undefined, `?id=${encodeURIComponent(item.id)}`)}><Trash2 className="size-3.5 text-red-500" /></Button>
                  </div>
                </div>
              ))}
              {!collection.items.length ? <div className="px-5 py-12 text-center text-sm text-zinc-500">Agregá el primer modelo, dataset o Space.</div> : null}
            </div>
          </section>
        </div>

        <aside>
          <form onSubmit={async (event) => { event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); await mutateItems("POST", { type: values.get("type"), path: values.get("path"), note: values.get("note") }); form.reset(); }} className="sticky top-6 rounded-2xl border border-indigo-950/10 bg-white p-4">
            <h2 className="font-semibold text-zinc-950">Agregar recurso</h2>
            <p className="mt-1 text-xs leading-5 text-zinc-500">La ruta debe existir y ser accesible para este tenant.</p>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Tipo<select name="type" disabled={!collection.access.manager} className={field}><option value="model">Modelo</option><option value="dataset">Dataset</option><option value="space">Space</option></select></label>
              <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Ruta<input name="path" required disabled={!collection.access.manager} maxLength={240} placeholder="namespace/slug" className={field} /></label>
              <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Nota<textarea name="note" disabled={!collection.access.manager} maxLength={500} rows={4} className={`${field} h-auto py-2`} /></label>
              <Button type="submit" disabled={!collection.access.manager || collection.items.length >= 100}>Agregar a la colección</Button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
