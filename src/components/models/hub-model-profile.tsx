import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Box,
  Download,
  File,
  FlaskConical,
  GitCommitHorizontal,
  LockKeyhole,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { ModelAccessButton } from "@/components/models/model-access-button";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import { listModelEvaluations } from "@/lib/hub/model-governance";
import {
  findModelRepository,
  listModelRevisions,
  modelRepositoryAccess,
} from "@/lib/hub/model-repository-store";

function formatBytes(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export async function HubModelProfile({ namespace, slug }: { namespace: string; slug: string }) {
  const session = await getSession();
  const auth = session?.user ? await sessionAuthContext(session.user.id) : null;
  const repository = await findModelRepository(namespace, slug);
  if (!repository) notFound();
  const access = await modelRepositoryAccess(repository, auth);
  if (!access.metadata) notFound();
  const [revisions, evaluations] = await Promise.all([
    access.content ? listModelRevisions(repository.id) : Promise.resolve([]),
    listModelEvaluations(repository, access.manager),
  ]);
  const latest = revisions[0];
  const path = `${repository.namespace}/${repository.slug}`;

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <nav className="mb-5 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/models" className="hover:text-indigo-700">models</Link>
          <span>/</span><span>{repository.namespace}</span><span>/</span>
          <span className="text-zinc-900">{repository.slug}</span>
        </nav>

        <header className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white shadow-[0_16px_60px_rgba(17,19,38,0.07)]">
          <div className="nexus-console-grid border-b border-white/10 bg-[#0b0e1a] px-6 py-6 text-white md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-cyan-300">
                  <Box className="size-4" /> {path}
                  {repository.namespaceVerified ? <ShieldCheck className="size-4" aria-label="Namespace verificado" /> : null}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${repository.verificationStatus === "verified" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200" : "border-amber-300/25 bg-amber-300/10 text-amber-200"}`}>
                    {repository.verificationStatus === "verified" ? `verified · v${repository.verifiedRevision}` : repository.verificationStatus}
                  </span>
                </div>
                <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">
                  {repository.title}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
                  {repository.description || "Repositorio de modelo versionado en Nexus Hub."}
                </p>
              </div>
              {access.manager ? (
                <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  <Link href={`/settings/models/${path}`}>Administrar</Link>
                </Button>
              ) : repository.verificationStatus === "verified" && repository.runtimeModelId ? (
                <Button asChild className="bg-cyan-300 text-zinc-950 hover:bg-cyan-200">
                  <Link href={`/models/${repository.runtimeModelId}`}>Abrir runtime verificado</Link>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-px bg-zinc-200 sm:grid-cols-4">
            {[
              ["Pipeline", repository.task ?? "sin declarar"],
              ["Librería", repository.libraryName ?? "agnóstico"],
              ["Revisión", repository.latestRevision ? `v${repository.latestRevision}` : "sin publicar"],
              ["Descargas", repository.downloads.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-5 py-4">
                <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">{label}</div>
                <div className="mt-1 truncate font-mono text-sm text-zinc-800">{value}</div>
              </div>
            ))}
          </div>
        </header>

        <section className={`mt-5 flex items-start gap-3 rounded-2xl border p-5 ${repository.verificationStatus === "verified" ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-amber-200 bg-amber-50/70 text-amber-950"}`}>
          {repository.verificationStatus === "verified" ? <ShieldCheck className="mt-0.5 size-5 shrink-0" /> : <ShieldX className="mt-0.5 size-5 shrink-0" />}
          <div>
            <h2 className="text-sm font-semibold">{repository.verificationStatus === "verified" ? "Revisión verificada y enlazada" : "Límite de confianza del gateway"}</h2>
            <p className={`mt-1 text-sm leading-relaxed ${repository.verificationStatus === "verified" ? "text-emerald-800" : "text-amber-800"}`}>
              {repository.verificationStatus === "verified" && repository.runtimeModelId
                ? `Nexus verificó la revisión v${repository.verifiedRevision} y la enlazó con ${repository.runtimeModelId}. Los artefactos del Hub siguen sin ejecutarse automáticamente: inferencia, precio y privacidad pertenecen al endpoint runtime curado.`
                : "Este repositorio distribuye documentación y artefactos; no es una ruta ejecutable, no declara precios y no puede entrar al fallback. La ejecución requiere un endpoint del catálogo validado por Nexus."}
            </p>
            {repository.verificationStatus === "verified" && repository.runtimeModelId ? <Button asChild size="sm" className="mt-3"><Link href={`/models/${repository.runtimeModelId}`}>Ver precio y proveedores</Link></Button> : null}
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="space-y-6">
            {!access.content ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 size-5 text-amber-700" />
                  <div>
                    <h2 className="font-semibold text-amber-950">Artefactos con acceso controlado</h2>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">La ficha es pública, pero los archivos requieren aprobación del propietario.</p>
                    <div className="mt-4">
                      {session?.user ? <ModelAccessButton path={path} /> : <Button asChild><Link href="/login">Ingresar para solicitar acceso</Link></Button>}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                  <div><h2 className="font-semibold text-zinc-950">Archivos en main</h2><p className="mt-0.5 text-xs text-zinc-500">Snapshot inmutable de la última revisión.</p></div>
                  {latest ? <span className="font-mono text-xs text-zinc-500">{latest.commitSha}</span> : null}
                </div>
                {latest?.files.length ? latest.files.map((file) => {
                  const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
                  return (
                    <a key={file.id} href={`/api/v1/models/${path}/resolve/main/${encodedPath}`} className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-3 text-sm last:border-0 hover:bg-indigo-50/40">
                      <span className="flex min-w-0 items-center gap-2"><File className="size-4 shrink-0 text-indigo-500" /><span className="truncate font-mono text-xs text-zinc-800">{file.path}</span></span>
                      <span className="shrink-0 font-mono text-[11px] text-zinc-500">{formatBytes(file.size)} ↓</span>
                    </a>
                  );
                }) : <div className="px-5 py-12 text-center text-sm text-zinc-500">Todavía no hay una revisión publicada.</div>}
              </section>
            )}

            <section className="rounded-2xl border border-indigo-950/10 bg-white p-5">
              <h2 className="font-semibold text-zinc-950">Model card</h2>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-600">
                {repository.modelCard || repository.description || "El propietario todavía no publicó documentación extendida."}
              </div>
              {latest && Object.keys(latest.metadata).length ? (
                <pre className="mt-5 overflow-auto rounded-xl bg-[#0b0e1a] p-4 font-mono text-xs leading-6 text-cyan-100">{JSON.stringify(latest.metadata, null, 2)}</pre>
              ) : null}
            </section>
            <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
              <div className="border-b border-zinc-200 px-5 py-4">
                <h2 className="flex items-center gap-2 font-semibold text-zinc-950"><FlaskConical className="size-4 text-indigo-500" /> Evaluaciones</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Resultados estructurados, anclados a una revisión y a evidencia SHA-256.</p>
              </div>
              <div className="divide-y divide-zinc-100">
                {evaluations.map((evaluation) => (
                  <div key={evaluation.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-zinc-900">{evaluation.benchmark}</span><span className="font-mono text-[10px] text-zinc-400">v{evaluation.revision}</span><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${evaluation.status === "verified" ? "bg-emerald-50 text-emerald-700" : evaluation.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{evaluation.status}</span></div>
                      <p className="mt-1 truncate text-xs text-zinc-500">{evaluation.task} · {evaluation.dataset} · {evaluation.evaluator}</p>
                      <a href={evaluation.evidence_url} target="_blank" rel="noreferrer" className="mt-1 block truncate font-mono text-[10px] text-indigo-600 hover:underline">evidence sha256:{evaluation.evidence_sha256}</a>
                    </div>
                    <div className="text-left sm:text-right"><div className="font-mono text-lg font-semibold text-zinc-950">{evaluation.metric_value}</div><div className="text-[10px] uppercase tracking-wide text-zinc-400">{evaluation.metric}</div></div>
                  </div>
                ))}
                {!evaluations.length ? <p className="px-5 py-10 text-center text-sm text-zinc-500">No hay resultados verificados para esta revisión.</p> : null}
              </div>
            </section>
          </main>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-indigo-950/10 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Metadatos</h2>
              <div className="mt-3 grid gap-2 text-xs text-zinc-600">
                <div className="flex items-center justify-between gap-3"><span>Licencia</span><span className="truncate font-mono">{repository.license}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Base</span><span className="truncate font-mono">{repository.baseModel ?? "—"}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Visibilidad</span><span className="font-mono">{repository.visibility}</span></div>
                <div className="flex items-center justify-between gap-3"><span>Acceso</span><span className="font-mono">{repository.gated ? "aprobación" : "directo"}</span></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{repository.tags.map((tag) => <span key={tag} className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">{tag}</span>)}</div>
            </section>
            <section className="rounded-2xl border border-indigo-950/10 bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><GitCommitHorizontal className="size-4 text-indigo-500" /> Historial</h2>
              <div className="mt-3 grid gap-3">
                {revisions.slice(0, 10).map((revision) => <div key={revision.id} className="border-l-2 border-indigo-100 pl-3"><div className="font-mono text-[11px] text-indigo-700">v{revision.revision} · {revision.commitSha}</div><div className="mt-0.5 text-xs text-zinc-600">{revision.commitMessage}</div></div>)}
                {!revisions.length ? <p className="text-xs text-zinc-500">Sin commits visibles.</p> : null}
              </div>
            </section>
            <div className="flex items-center gap-2 px-1 text-xs text-zinc-500"><Download className="size-3.5" /> Revisiones numeradas usan caché inmutable.</div>
          </aside>
        </div>
      </div>
    </MarketingShell>
  );
}
