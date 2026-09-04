"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ExternalLink } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";
import type { SpaceRow } from "./space-manager";

type ManagedSpace = SpaceRow & {
  recent_runs: Array<{ id: string; generation_id: string | null; model: string; created_at: string }>;
};

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export function SpaceWorkspace({ namespace, slug }: { namespace: string; slug: string }) {
  const path = `/api/v1/spaces/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}`;
  const [space, reload, loadError] = useRemoteData<ManagedSpace>(path);
  const [message, setMessage] = useState<string | null>(null);

  if (loadError) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>;
  if (!space) return <div className="text-sm text-zinc-500">Cargando Space…</div>;

  return (
    <div>
      <AppPageHeader title={space.title} actions={<Button asChild size="sm" variant="outline"><Link href={`/spaces/${namespace}/${slug}`}>Abrir runtime <ExternalLink className="ml-1 size-3.5" /></Link></Button>}>
        <span className="font-mono text-xs">{space.path}</span> · configuración versionada por fecha y aplicada en cada ejecución.
      </AppPageHeader>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form
          className="grid gap-4 rounded-2xl border border-indigo-950/10 bg-white p-5 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setMessage("Guardando…");
            const values = new FormData(event.currentTarget);
            const response = await fetch(path, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: values.get("title"), description: values.get("description"),
                visibility: values.get("visibility"), model: values.get("model"),
                system_prompt: values.get("system_prompt"), starter_prompt: values.get("starter_prompt") || null,
                temperature: Number(values.get("temperature")), max_tokens: Number(values.get("max_tokens")),
              }),
            });
            const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
            setMessage(response.ok ? "Cambios guardados." : json.error?.message ?? "No se pudo guardar");
            if (response.ok) reload();
          }}
        >
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Nombre<input name="title" required maxLength={120} defaultValue={space.title} className={field} /></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Descripción<textarea name="description" maxLength={5000} rows={3} defaultValue={space.description} className={`${field} h-auto py-2`} /></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Modelo<input name="model" required maxLength={180} defaultValue={space.model} className={field} /></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" defaultValue={space.visibility} className={field}><option value="public">Público</option><option value="private">Privado</option></select></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Instrucción de sistema<textarea name="system_prompt" maxLength={32000} rows={7} defaultValue={space.system_prompt} className={`${field} h-auto py-2 font-mono text-xs`} /></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Prompt inicial<textarea name="starter_prompt" maxLength={4000} rows={3} defaultValue={space.starter_prompt ?? ""} className={`${field} h-auto py-2`} /></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Temperatura<input name="temperature" type="number" min="0" max="2" step="0.1" defaultValue={space.temperature} className={field} /></label>
          <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Máximo de tokens<input name="max_tokens" type="number" min="1" max="131072" defaultValue={space.max_tokens} className={field} /></label>
          <div className="flex items-center gap-3 md:col-span-2"><Button type="submit">Guardar configuración</Button>{message ? <span className="text-sm text-zinc-600">{message}</span> : null}</div>
        </form>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-indigo-950/10 bg-white p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><Activity className="size-4 text-indigo-500" /> Operación</h2>
            <div className="mt-3 grid gap-2 text-xs text-zinc-600"><div className="flex justify-between"><span>Ejecuciones</span><span className="font-mono">{space.runs}</span></div><div className="flex justify-between"><span>Modelo</span><span className="max-w-[11rem] truncate font-mono" title={space.model}>{space.model}</span></div><div className="flex justify-between"><span>Ledger</span><span className="font-mono text-emerald-700">reserve→settle</span></div></div>
          </section>
          <section className="rounded-2xl border border-indigo-950/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-900">Runs recientes</h2>
            <div className="mt-3 grid gap-3">{space.recent_runs.slice(0, 12).map((run) => <div key={run.id} className="border-l-2 border-indigo-100 pl-3"><div className="font-mono text-[10px] text-zinc-500">{new Date(run.created_at).toLocaleString()}</div><div className="mt-0.5 truncate font-mono text-[11px] text-indigo-700">{run.generation_id ?? run.id}</div></div>)}{!space.recent_runs.length ? <p className="text-xs text-zinc-500">Sin ejecuciones registradas.</p> : null}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}

