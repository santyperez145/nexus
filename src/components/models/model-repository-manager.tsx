"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Box, GitCommitHorizontal, LockKeyhole, Plus, ShieldX } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useRemoteData } from "@/lib/use-remote-data";

export type ModelRepositoryRow = {
  id: string;
  namespace: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  model_card: string;
  visibility: "public" | "private";
  gated: boolean;
  license: string;
  pipeline_tag: string | null;
  library_name: string | null;
  base_model: string | null;
  tags: string[];
  latest_revision: number;
  downloads: number;
  updated_at: string;
  nexus: {
    executable: false;
    reference_only: true;
    verification_status: "unverified" | "pending" | "verified" | "rejected" | "stale";
    verified_revision: number | null;
    current_revision_verified: boolean;
    runtime_model_id: string | null;
    promoted: boolean;
    verified_at: string | null;
  };
};

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

async function responseData<T>(response: Response) {
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Solicitud rechazada (${response.status})`);
  return json.data;
}

export function ModelRepositoryManager() {
  const router = useRouter();
  const [rows, reload, loadError] = useRemoteData<ModelRepositoryRow[]>("/api/v1/models?mine=1&limit=100");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const repositories = rows ?? [];

  return (
    <div>
      <AppPageHeader title="Repositorios de modelos" actions={<Button asChild size="sm" variant="outline"><Link href="/models">Ver catálogo y Hub</Link></Button>}>
        Publicá model cards y artefactos versionados sin abrir una ruta ejecutable. Nexus mantiene una frontera estricta entre publicación y routing verificado.
      </AppPageHeader>

      <section className="nexus-console-grid mb-5 overflow-hidden rounded-2xl border border-indigo-950/15 bg-[#0b0e1a] text-white">
        <div className="grid gap-px bg-white/10 sm:grid-cols-3">
          {[
            ["Repositorios", repositories.length],
            ["Revisiones", repositories.reduce((sum, row) => sum + row.latest_revision, 0)],
            ["Límite", "no ejecutable"],
          ].map(([label, value]) => <div key={String(label)} className="bg-[#0b0e1a]/95 px-5 py-4"><div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div><div className="mt-1 font-mono text-lg text-cyan-100">{value}</div></div>)}
        </div>
      </section>

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
        <ShieldX className="mt-0.5 size-4 shrink-0" /><p>Publicar archivos nunca habilita inferencia ni precios. Solo el catálogo operativo, validado por Nexus, puede recibir tráfico y consumir créditos.</p>
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
        <button type="button" onClick={() => setCreating((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-indigo-50/40" aria-expanded={creating}>
          <span><span className="font-semibold text-zinc-950">Nuevo repositorio</span><span className="mt-0.5 block text-xs text-zinc-500">Reservá un path y definí model card, licencia y acceso.</span></span>
          <Plus className={`size-5 text-indigo-600 transition ${creating ? "rotate-45" : ""}`} />
        </button>
        {creating ? (
          <form className="grid gap-4 border-t border-zinc-200 bg-zinc-50/60 p-5 md:grid-cols-2" onSubmit={async (event) => {
            event.preventDefault(); setMessage("Creando…"); const values = new FormData(event.currentTarget);
            try {
              const created = await responseData<ModelRepositoryRow>(await fetch("/api/v1/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
                namespace: values.get("namespace"), slug: values.get("slug"), title: values.get("title"), description: values.get("description"), model_card: values.get("model_card"), visibility: values.get("visibility"), gated: values.get("gated") === "on", license: values.get("license"), pipeline_tag: values.get("pipeline_tag") || null, library_name: values.get("library_name") || null, base_model: values.get("base_model") || null, tags: String(values.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
              }) }));
              if (created) router.push(`/settings/models/${created.namespace}/${created.slug}`);
            } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo crear el repositorio"); }
          }}>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Namespace<input name="namespace" required maxLength={100} placeholder="tu-equipo" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Slug<input name="slug" required maxLength={120} placeholder="modelo-espanol" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Nombre visible<input name="title" required maxLength={120} placeholder="Modelo Español 7B" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Descripción<textarea name="description" maxLength={5000} rows={2} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700 md:col-span-2">Model card<textarea name="model_card" maxLength={64000} rows={5} placeholder="Uso previsto, limitaciones, evaluación y procedencia…" className={`${field} h-auto py-2 font-mono text-xs`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Pipeline<input name="pipeline_tag" maxLength={64} placeholder="text-generation" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Librería<input name="library_name" maxLength={64} placeholder="transformers" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Modelo base<input name="base_model" maxLength={180} placeholder="organización/modelo-base" className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Licencia<input name="license" defaultValue="other" maxLength={64} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" className={field}><option value="public">Público</option><option value="private">Privado</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Etiquetas<input name="tags" placeholder="spanish, 7b, instruction" className={field} /></label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2"><input type="checkbox" name="gated" className="size-4 accent-indigo-600" />Requerir aprobación para descargar artefactos</label>
            <div className="flex items-center gap-3 md:col-span-2"><Button type="submit">Crear repositorio</Button>{message ? <span className="text-sm text-zinc-600">{message}</span> : null}</div>
          </form>
        ) : null}
      </section>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}
      <div className="grid gap-3">
        {repositories.map((repository) => (
          <div key={repository.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-950/10 bg-white p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><Box className="size-4 text-indigo-500" /><Link href={`/settings/models/${repository.path}`} className="truncate font-mono text-sm font-semibold text-zinc-900 hover:text-indigo-700">{repository.path}</Link><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${repository.visibility === "private" ? "bg-zinc-200 text-zinc-700" : "bg-emerald-50 text-emerald-700"}`}>{repository.visibility}</span>{repository.gated ? <LockKeyhole className="size-3.5 text-amber-600" aria-label="Gated" /> : null}</div>
              <div className="mt-1 text-sm text-zinc-600">{repository.title}</div>
              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-zinc-500"><span className="flex items-center gap-1"><GitCommitHorizontal className="size-3" /> rev {repository.latest_revision}</span><span>{repository.pipeline_tag ?? "sin pipeline"}</span><span className={repository.nexus.verification_status === "verified" ? "text-emerald-700" : repository.nexus.verification_status === "rejected" ? "text-rose-700" : "text-amber-700"}>{repository.nexus.verification_status}</span>{repository.nexus.runtime_model_id ? <span className="truncate text-indigo-700">→ {repository.nexus.runtime_model_id}</span> : null}</div>
            </div>
            <div className="flex items-center gap-1"><Button asChild size="sm" variant="outline"><Link href={`/settings/models/${repository.path}`}>Administrar</Link></Button><ConfirmAction triggerLabel="Eliminar" title={`Eliminar ${repository.path}`} description="Se eliminarán el repositorio, revisiones y solicitudes. Los archivos originales permanecen si no están usados por otro recurso Hub." confirmLabel="Eliminar repositorio" onConfirm={async () => { await responseData(await fetch(`/api/v1/models/${repository.path}`, { method: "DELETE" })); reload(); }} /></div>
          </div>
        ))}
        {rows && !repositories.length ? <div className="rounded-2xl border border-dashed border-indigo-200 bg-white px-5 py-14 text-center text-sm text-zinc-500">Todavía no publicaste repositorios de modelos.</div> : null}
      </div>
    </div>
  );
}
