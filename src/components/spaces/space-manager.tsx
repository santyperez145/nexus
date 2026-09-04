"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boxes, Eye, Play, Plus } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useRemoteData } from "@/lib/use-remote-data";

export type SpaceRow = {
  id: string;
  namespace: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  model: string;
  system_prompt: string;
  starter_prompt: string | null;
  temperature: number;
  max_tokens: number;
  runs: number;
  updated_at: string;
};

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

async function responseData<T>(response: Response) {
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Solicitud rechazada (${response.status})`);
  return json.data;
}

export function SpaceManager() {
  const router = useRouter();
  const [rows, reload, loadError] = useRemoteData<SpaceRow[]>("/api/v1/spaces?mine=1&limit=100");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const spaces = rows ?? [];

  return (
    <div>
      <AppPageHeader
        title="Spaces"
        actions={<Button asChild size="sm" variant="outline"><Link href="/spaces">Ver directorio público</Link></Button>}
      >
        Publicá experiencias de IA sobre cualquier modelo de texto ejecutable del catálogo. Cada ejecución conserva el enrutamiento, la privacidad y el ledger de Nexus.
      </AppPageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Spaces", spaces.length],
          ["Ejecuciones", spaces.reduce((sum, row) => sum + row.runs, 0)],
          ["Modelos", new Set(spaces.map((row) => row.model)).size],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-indigo-950/10 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-xl text-zinc-900">{value}</div>
          </div>
        ))}
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
        <button type="button" onClick={() => setCreating((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-indigo-50/40" aria-expanded={creating}>
          <span><span className="font-semibold text-zinc-950">Nuevo Space</span><span className="mt-0.5 block text-xs text-zinc-500">Configurá una experiencia segura y compartible, sin desplegar otro backend.</span></span>
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
                const created = await responseData<SpaceRow>(await fetch("/api/v1/spaces", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    namespace: values.get("namespace"),
                    slug: values.get("slug"),
                    title: values.get("title"),
                    description: values.get("description"),
                    visibility: values.get("visibility"),
                    model: values.get("model"),
                    system_prompt: values.get("system_prompt"),
                    starter_prompt: values.get("starter_prompt") || null,
                    temperature: Number(values.get("temperature")),
                    max_tokens: Number(values.get("max_tokens")),
                  }),
                }));
                if (created) router.push(`/settings/spaces/${created.namespace}/${created.slug}`);
              } catch (reason) {
                setMessage(reason instanceof Error ? reason.message : "No se pudo crear el Space");
              }
            }}
          >
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Namespace<input name="namespace" required maxLength={100} placeholder="tu-equipo" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Slug<input name="slug" required maxLength={120} placeholder="research-copilot" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Nombre visible<input name="title" required maxLength={120} placeholder="Research copilot" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Descripción<textarea name="description" maxLength={5000} rows={2} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Modelo<input name="model" required defaultValue="nexus/auto" maxLength={180} className={field} /><span className="font-normal text-zinc-400">ID del catálogo; admite Nexus Auto y proveedores conectados.</span></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" className={field}><option value="public">Público</option><option value="private">Privado</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Instrucción de sistema<textarea name="system_prompt" maxLength={32000} rows={4} className={`${field} h-auto py-2 font-mono text-xs`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Prompt inicial<textarea name="starter_prompt" maxLength={4000} rows={2} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Temperatura<input name="temperature" type="number" min="0" max="2" step="0.1" defaultValue="0.7" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Máximo de tokens<input name="max_tokens" type="number" min="1" max="131072" defaultValue="1024" className={field} /></label>
            <div className="flex items-center gap-3 md:col-span-2"><Button type="submit">Crear Space</Button>{message ? <span className="text-sm text-zinc-600">{message}</span> : null}</div>
          </form>
        ) : null}
      </section>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}
      <div className="grid gap-3">
        {spaces.map((space) => (
          <div key={space.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-950/10 bg-white p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Boxes className="size-4 text-indigo-500" /><Link href={`/settings/spaces/${space.namespace}/${space.slug}`} className="truncate font-mono text-sm font-semibold text-zinc-900 hover:text-indigo-700">{space.path}</Link><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${space.visibility === "private" ? "bg-zinc-200 text-zinc-700" : "bg-emerald-50 text-emerald-700"}`}>{space.visibility}</span></div>
              <div className="mt-1 text-sm text-zinc-600">{space.title}</div>
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-zinc-500"><span>{space.model}</span><span className="flex items-center gap-1"><Play className="size-3" /> {space.runs} runs</span></div>
            </div>
            <div className="flex items-center gap-1">
              {space.visibility === "public" ? <Button asChild size="sm" variant="ghost"><Link href={`/spaces/${space.namespace}/${space.slug}`}><Eye className="mr-1 size-3.5" />Abrir</Link></Button> : null}
              <Button asChild size="sm" variant="outline"><Link href={`/settings/spaces/${space.namespace}/${space.slug}`}>Configurar</Link></Button>
              <ConfirmAction triggerLabel="Eliminar" title={`Eliminar ${space.path}`} description="Se eliminarán el Space y su historial de ejecuciones asociado. Las generaciones facturadas conservan su registro operativo." confirmLabel="Eliminar Space" onConfirm={async () => { await responseData(await fetch(`/api/v1/spaces/${space.namespace}/${space.slug}`, { method: "DELETE" })); reload(); }} />
            </div>
          </div>
        ))}
        {rows && !spaces.length ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-5 py-14 text-center text-sm text-zinc-500">Todavía no creaste Spaces. Publicá el primero desde el formulario.</div> : null}
      </div>
    </div>
  );
}

