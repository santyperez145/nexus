"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, File, GitCommitHorizontal, ShieldX, Upload } from "lucide-react";
import { AppPageHeader } from "@/components/layout/app-page-header";
import { Button } from "@/components/ui/button";
import { useRemoteData } from "@/lib/use-remote-data";
import { uploadNexusFile } from "@/lib/files/browser-upload";
import type { ModelRepositoryRow } from "./model-repository-manager";

type StoredFile = { id: string; filename: string; bytes: number; mime?: string; status: string; sha256?: string | null };
type Revision = { revision: number; commit_sha: string; commit_message: string; metadata: Record<string, unknown>; created_at: string; files: Array<{ id: string; path: string; bytes: number; mime: string }> };
type Detail = ModelRepositoryRow & { workspace_id?: string | null; access: { metadata: boolean; content: boolean; tenant: boolean; manager: boolean; approved: boolean }; revisions: Revision[] };
type Grant = { id: string; name: string; email: string; status: string; requestedAt: string };
type AccessData = { manager: boolean; grants: Grant[] };

const field = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

async function jsonData<T>(response: Response) {
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `Solicitud rechazada (${response.status})`);
  return json.data;
}

export function ModelRepositoryWorkspace({ namespace, slug }: { namespace: string; slug: string }) {
  const path = `${namespace}/${slug}`;
  const [repository, reloadRepository, repositoryError] = useRemoteData<Detail>(`/api/v1/models/${path}`);
  const filePath = repository?.workspace_id ? `/api/v1/files?workspace_id=${encodeURIComponent(repository.workspace_id)}` : "/api/v1/files";
  const [files, reloadFiles, filesError] = useRemoteData<StoredFile[]>(filePath);
  const [access, reloadAccess] = useRemoteData<AccessData>(`/api/v1/models/${path}/access`);
  const [selected, setSelected] = useState<Record<string, { enabled: boolean; path: string }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const selectedCount = useMemo(() => Object.values(selected).filter((item) => item.enabled).length, [selected]);

  if (!repository && !repositoryError) return <div className="py-20 text-center text-sm text-zinc-500">Cargando repositorio…</div>;
  if (!repository) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{repositoryError ?? "Repositorio no disponible"}</div>;

  return (
    <div>
      <AppPageHeader title={repository.title} actions={<><Button asChild size="sm" variant="outline"><Link href={`/models/${path}`}>Ficha pública</Link></Button><Button asChild size="sm" variant="ghost"><Link href="/settings/models">Todos</Link></Button></>}>
        <span className="font-mono text-xs text-indigo-700">{path}</span> · documentación, artefactos, historial y acceso en una única identidad tenant.
      </AppPageHeader>

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900"><ShieldX className="mt-0.5 size-4 shrink-0" /><p>Estado fijo: <strong>reference only</strong>. Ningún campo de esta vista puede habilitar routing o precios.</p></div>
      <div className="mb-5 grid gap-3 sm:grid-cols-4">{[["Revisión", repository.latest_revision ? `v${repository.latest_revision}` : "—"], ["Descargas", repository.downloads], ["Visibilidad", repository.visibility], ["Pipeline", repository.pipeline_tag ?? "—"]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-indigo-950/10 bg-white px-4 py-3"><div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</div><div className="mt-1 truncate font-mono text-sm text-zinc-900">{value}</div></div>)}</div>
      {message ? <div className="mb-5 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
            <div className="border-b border-zinc-200 px-5 py-4"><h2 className="font-semibold text-zinc-950">Publicar revisión</h2><p className="mt-0.5 text-xs text-zinc-500">Snapshot inmutable con SHA-256. Carga directa S3-compatible hasta 5 GiB cuando está configurada.</p></div>
            <div className="border-b border-zinc-100 bg-zinc-50/60 px-5 py-3">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-800"><Upload className="size-4" />{uploading ? "Subiendo…" : "Subir archivo"}<input type="file" className="hidden" disabled={uploading} onChange={async (event) => {
                const file = event.target.files?.[0]; if (!file) return; setUploading(true); setMessage(null);
                try { await uploadNexusFile(file, { workspaceId: repository.workspace_id, onProgress: (value) => setMessage(`Procesando ${file.name} · ${Math.round(value * 100)}%`) }); reloadFiles(); setMessage(`${file.name} quedó disponible con integridad verificada.`); }
                catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo subir"); }
                finally { setUploading(false); event.target.value = ""; }
              }} /></label>
            </div>
            <form className="p-5" onSubmit={async (event) => {
              event.preventDefault(); setMessage("Publicando revisión…"); const formElement = event.currentTarget; const form = new FormData(formElement);
              const revisionFiles = Object.entries(selected).filter(([, value]) => value.enabled).map(([fileId, value]) => ({ file_id: fileId, path: value.path }));
              try { await jsonData(await fetch(`/api/v1/models/${path}/revisions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commit_message: form.get("commit_message"), metadata: { source: "nexus-console", reference_only: true }, files: revisionFiles }) })); setSelected({}); reloadRepository(); setMessage("Revisión publicada en main."); formElement.reset(); }
              catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo publicar"); }
            }}>
              <div className="grid gap-2">{(files ?? []).map((file) => { const state = selected[file.id] ?? { enabled: false, path: file.filename }; return <div key={file.id} className={`grid items-center gap-3 rounded-xl border p-3 sm:grid-cols-[auto_minmax(8rem,.8fr)_minmax(12rem,1fr)] ${state.enabled ? "border-indigo-200 bg-indigo-50/40" : "border-zinc-200"}`}><input aria-label={`Incluir ${file.filename}`} type="checkbox" checked={state.enabled} className="size-4 accent-indigo-600" onChange={(event) => setSelected((current) => ({ ...current, [file.id]: { ...state, enabled: event.target.checked } }))} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-zinc-800">{file.filename}</span><span className="font-mono text-[10px] text-zinc-500">{file.bytes} bytes</span></span><input aria-label={`Ruta para ${file.filename}`} value={state.path} disabled={!state.enabled} onChange={(event) => setSelected((current) => ({ ...current, [file.id]: { enabled: state.enabled, path: event.target.value } }))} className={`${field} h-9 font-mono text-xs disabled:bg-zinc-100 disabled:text-zinc-400`} /></div>; })}{filesError ? <p className="text-sm text-red-600">{filesError}</p> : null}</div>
              <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid min-w-[16rem] flex-1 gap-1.5 text-xs font-medium text-zinc-700">Mensaje del commit<input name="commit_message" required maxLength={240} placeholder="Publica pesos cuantizados" className={field} /></label><Button type="submit" disabled={!selectedCount}>Publicar {selectedCount || ""} archivo{selectedCount === 1 ? "" : "s"}</Button></div>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white"><div className="border-b border-zinc-200 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold text-zinc-950"><GitCommitHorizontal className="size-4 text-indigo-500" /> Historial</h2></div>{repository.revisions.map((revision) => <div key={revision.commit_sha} className="border-b border-zinc-100 p-5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-xs font-semibold text-indigo-700">v{revision.revision} · {revision.commit_sha}</span><span className="text-[11px] text-zinc-500">{new Date(revision.created_at).toLocaleString("es-AR")}</span></div><p className="mt-1 text-sm text-zinc-700">{revision.commit_message}</p><div className="mt-3 grid gap-1">{revision.files.map((file) => <div key={`${revision.commit_sha}-${file.path}`} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[11px] text-zinc-600"><span className="flex min-w-0 items-center gap-2"><File className="size-3.5 shrink-0 text-zinc-400" /><span className="truncate">{file.path}</span></span><span>{file.bytes} B</span></div>)}</div></div>)}{!repository.revisions.length ? <div className="px-5 py-12 text-center text-sm text-zinc-500">Todavía no hay revisiones.</div> : null}</section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-indigo-950/10 bg-white p-5"><h2 className="font-semibold text-zinc-950">Model card y política</h2><form className="mt-4 grid gap-3" onSubmit={async (event) => {
            event.preventDefault(); setMessage("Guardando…"); const form = new FormData(event.currentTarget);
            try { await jsonData(await fetch(`/api/v1/models/${path}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.get("title"), description: form.get("description"), model_card: form.get("model_card"), visibility: form.get("visibility"), gated: form.get("gated") === "on", license: form.get("license"), pipeline_tag: form.get("pipeline_tag") || null, library_name: form.get("library_name") || null, base_model: form.get("base_model") || null, tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean) }) })); reloadRepository(); setMessage("Ficha actualizada."); }
            catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar"); }
          }}>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Nombre<input name="title" defaultValue={repository.title} className={field} required /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Descripción<textarea name="description" defaultValue={repository.description} rows={3} maxLength={5000} className={`${field} h-auto py-2`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Model card<textarea name="model_card" defaultValue={repository.model_card} rows={10} maxLength={64000} className={`${field} h-auto py-2 font-mono text-xs`} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Pipeline<input name="pipeline_tag" defaultValue={repository.pipeline_tag ?? ""} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Librería<input name="library_name" defaultValue={repository.library_name ?? ""} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Modelo base<input name="base_model" defaultValue={repository.base_model ?? ""} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Licencia<input name="license" defaultValue={repository.license} className={field} /></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Visibilidad<select name="visibility" defaultValue={repository.visibility} className={field}><option value="public">Público</option><option value="private">Privado</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-zinc-700">Etiquetas<input name="tags" defaultValue={repository.tags.join(", ")} className={field} /></label>
            <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" name="gated" defaultChecked={repository.gated} className="size-4 accent-indigo-600" />Aprobación obligatoria</label>
            <Button type="submit">Guardar cambios</Button>
          </form></section>

          <section className="rounded-2xl border border-indigo-950/10 bg-white p-5"><h2 className="font-semibold text-zinc-950">Solicitudes de acceso</h2><div className="mt-4 grid gap-2">{(access?.grants ?? []).map((grant) => <div key={grant.id} className="rounded-xl border border-zinc-200 p-3"><div className="truncate text-sm font-medium text-zinc-800">{grant.name}</div><div className="truncate text-xs text-zinc-500">{grant.email}</div><div className="mt-2 flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${grant.status === "approved" ? "bg-emerald-50 text-emerald-700" : grant.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{grant.status}</span>{grant.status === "pending" ? <div className="flex gap-1"><Button size="xs" onClick={async () => { await jsonData(await fetch(`/api/v1/models/${path}/access`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: grant.id, status: "approved" }) })); reloadAccess(); setMessage("Acceso aprobado."); }}><Check className="size-3" /> Aprobar</Button><Button size="xs" variant="ghost" onClick={async () => { await jsonData(await fetch(`/api/v1/models/${path}/access`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: grant.id, status: "rejected" }) })); reloadAccess(); }}>Rechazar</Button></div> : null}</div></div>)}{access && !access.grants.length ? <p className="py-5 text-center text-sm text-zinc-500">No hay solicitudes.</p> : null}</div></section>
        </div>
      </div>
    </div>
  );
}
