"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Database, GitCommitHorizontal, LockKeyhole, Plus } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useRemoteData } from "@/lib/use-remote-data";

export type DatasetRow = {
  id: string;
  namespace: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  visibility: "public" | "private";
  gated: boolean;
  license: string;
  task: string | null;
  tags: string[];
  latest_revision: number;
  downloads: number;
  updated_at: string;
};

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

async function responseMessage(response: Response) {
  const json = (await response.json().catch(() => ({}))) as {
    data?: DatasetRow;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(json.error?.message ?? `Solicitud rechazada (${response.status})`);
  return json.data;
}

export function DatasetManager() {
  const router = useRouter();
  const [rows, reload, loadError] = useRemoteData<DatasetRow[]>("/api/v1/datasets?mine=1&limit=100");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const datasets = rows ?? [];

  return (
    <div>
      <AppPageHeader
        title="Datasets"
        actions={<Button asChild size="sm" variant="outline"><Link href="/datasets">Ver Hub público</Link></Button>}
      >
        Repositorios versionados para evaluación, ajuste y agentes. Cada revisión es un snapshot
        inmutable; la visibilidad y el gating se aplican antes de leer cualquier byte.
      </AppPageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Repositorios", datasets.length],
          ["Revisiones", datasets.reduce((sum, row) => sum + row.latest_revision, 0)],
          ["Privados / gated", datasets.filter((row) => row.visibility === "private" || row.gated).length],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-indigo-950/10 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</div>
            <div className="mt-1 font-mono text-xl text-zinc-900">{value}</div>
          </div>
        ))}
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-indigo-50/40"
          aria-expanded={creating}
        >
          <span><span className="font-semibold text-zinc-950">Nuevo repositorio</span><span className="mt-0.5 block text-xs text-zinc-500">Reservá un namespace personal y definí su política.</span></span>
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
                const created = await responseMessage(
                  await fetch("/api/v1/datasets", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      namespace: values.get("namespace"),
                      slug: values.get("slug"),
                      title: values.get("title"),
                      description: values.get("description"),
                      visibility: values.get("visibility"),
                      gated: values.get("gated") === "on",
                      license: values.get("license"),
                      task: values.get("task") || null,
                      tags: String(values.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
                    }),
                  }),
                );
                if (created) router.push(`/settings/datasets/${created.namespace}/${created.slug}`);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "No se pudo crear el dataset");
              }
            }}
          >
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Namespace<input name="namespace" required maxLength={100} placeholder="tu-equipo" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Slug<input name="slug" required maxLength={120} placeholder="support-evals" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Nombre visible<input name="title" required maxLength={120} placeholder="Evaluaciones de soporte" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Descripción<textarea name="description" maxLength={5000} rows={3} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" className={field}><option value="public">Público</option><option value="private">Privado</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Licencia<input name="license" defaultValue="other" maxLength={64} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Tarea<input name="task" maxLength={64} placeholder="text-classification" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Etiquetas<input name="tags" placeholder="spanish, evals, support" className={field} /></label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2"><input type="checkbox" name="gated" className="size-4 accent-indigo-600" />Requerir aprobación para descargar</label>
            <div className="flex items-center gap-3 md:col-span-2"><Button type="submit">Crear repositorio</Button>{message ? <span className="text-sm text-zinc-600">{message}</span> : null}</div>
          </form>
        ) : null}
      </section>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}
      <div className="grid gap-3">
        {datasets.map((dataset) => (
          <div key={dataset.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-950/10 bg-white p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Database className="size-4 text-indigo-500" />
                <Link href={`/settings/datasets/${dataset.namespace}/${dataset.slug}`} className="truncate font-mono text-sm font-semibold text-zinc-900 hover:text-indigo-700">{dataset.path}</Link>
                <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${dataset.visibility === "private" ? "bg-zinc-200 text-zinc-700" : "bg-emerald-50 text-emerald-700"}`}>{dataset.visibility}</span>
                {dataset.gated ? <LockKeyhole className="size-3.5 text-amber-600" aria-label="Gated" /> : null}
              </div>
              <div className="mt-1 text-sm text-zinc-600">{dataset.title}</div>
              <div className="mt-2 flex gap-4 font-mono text-[11px] text-zinc-500"><span className="flex items-center gap-1"><GitCommitHorizontal className="size-3" /> rev {dataset.latest_revision}</span><span>{dataset.downloads} descargas</span></div>
            </div>
            <div className="flex items-center gap-1">
              <Button asChild size="sm" variant="outline"><Link href={`/settings/datasets/${dataset.namespace}/${dataset.slug}`}>Administrar</Link></Button>
              <ConfirmAction triggerLabel="Eliminar" title={`Eliminar ${dataset.path}`} description="Se eliminarán el repositorio, sus revisiones y solicitudes. Los archivos originales seguirán en tu biblioteca si no están usados por otro dataset." confirmLabel="Eliminar dataset" onConfirm={async () => {
                const response = await fetch(`/api/v1/datasets/${dataset.namespace}/${dataset.slug}`, { method: "DELETE" });
                await responseMessage(response);
                reload();
              }} />
            </div>
          </div>
        ))}
        {rows && !datasets.length ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-5 py-14 text-center text-sm text-zinc-500">Todavía no creaste datasets. Abrí el formulario y publicá el primero.</div> : null}
      </div>
    </div>
  );
}
