import Link from "next/link";
import { notFound } from "next/navigation";
import { Database, Download, File, GitCommitHorizontal, LockKeyhole, ShieldCheck } from "lucide-react";
import { DatasetAccessButton } from "@/components/datasets/dataset-access-button";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { sessionAuthContext } from "@/lib/gateway/api-auth";
import {
  datasetAccess,
  findDatasetRepository,
  listDatasetRevisions,
} from "@/lib/hub/repository-store";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default async function DatasetPage({ params }: { params: Promise<{ namespace: string; slug: string }> }) {
  const { namespace, slug } = await params;
  const session = await getSession();
  const auth = session?.user ? await sessionAuthContext(session.user.id) : null;
  const repository = await findDatasetRepository(namespace, slug);
  if (!repository) notFound();
  const access = await datasetAccess(repository, auth);
  if (!access.metadata) notFound();
  const revisions = access.content ? await listDatasetRevisions(repository.id) : [];
  const latest = revisions[0];

  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <nav className="mb-5 flex items-center gap-2 font-mono text-xs text-zinc-500">
          <Link href="/datasets" className="hover:text-indigo-700">datasets</Link>
          <span>/</span><span>{repository.namespace}</span><span>/</span><span className="text-zinc-900">{repository.slug}</span>
        </nav>

        <header className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white shadow-[0_16px_60px_rgba(17,19,38,0.07)]">
          <div className="nexus-console-grid border-b border-white/10 bg-[#0b0e1a] px-6 py-6 text-white md:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-cyan-300">
                  <Database className="size-4" /> {repository.namespace}/{repository.slug}
                  {repository.namespaceVerified ? <ShieldCheck className="size-4" aria-label="Verificado" /> : null}
                </div>
                <h1 className="mt-3 font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-white">{repository.title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{repository.description || "Dataset versionado en Nexus Hub."}</p>
              </div>
              {access.manager ? (
                <Button asChild variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  <Link href={`/settings/datasets/${repository.namespace}/${repository.slug}`}>Administrar</Link>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-px bg-zinc-200 sm:grid-cols-4">
            {[
              ["Licencia", repository.license],
              ["Tarea", repository.task ?? "general"],
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <main className="space-y-6">
            {!access.content ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
                <div className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 size-5 text-amber-700" />
                  <div>
                    <h2 className="font-semibold text-amber-950">Acceso controlado</h2>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">La ficha es pública, pero sus revisiones y archivos se mantienen cerrados hasta que el propietario apruebe la solicitud.</p>
                    <div className="mt-4">
                      {session?.user ? <DatasetAccessButton path={`${repository.namespace}/${repository.slug}`} /> : (
                        <Button asChild><Link href="/login">Ingresar para solicitar acceso</Link></Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="overflow-hidden rounded-2xl border border-indigo-950/10 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-zinc-950">Archivos en main</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Snapshot completo de la última revisión.</p>
                  </div>
                  {latest ? <span className="font-mono text-xs text-zinc-500">{latest.commitSha}</span> : null}
                </div>
                {latest?.files.length ? latest.files.map((file) => {
                  const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
                  return (
                    <a key={file.id} href={`/api/v1/datasets/${repository.namespace}/${repository.slug}/resolve/main/${encodedPath}`} className="flex items-center justify-between gap-4 border-b border-zinc-100 px-5 py-3 text-sm last:border-0 hover:bg-indigo-50/40">
                      <span className="flex min-w-0 items-center gap-2"><File className="size-4 shrink-0 text-indigo-500" /><span className="truncate font-mono text-xs text-zinc-800">{file.path}</span></span>
                      <span className="shrink-0 font-mono text-[11px] text-zinc-500">{formatBytes(file.size)} ↓</span>
                    </a>
                  );
                }) : <div className="px-5 py-12 text-center text-sm text-zinc-500">Todavía no hay una revisión publicada.</div>}
              </section>
            )}

            {access.content && latest ? (
              <section className="rounded-2xl border border-indigo-950/10 bg-white p-5">
                <h2 className="font-semibold text-zinc-950">Dataset card</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-600">{repository.description || "El propietario todavía no agregó documentación extendida."}</p>
                {Object.keys(latest.metadata).length ? <pre className="mt-5 overflow-auto rounded-xl bg-[#0b0e1a] p-4 font-mono text-xs leading-6 text-cyan-100">{JSON.stringify(latest.metadata, null, 2)}</pre> : null}
              </section>
            ) : null}
          </main>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-indigo-950/10 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">Gobernanza</h2>
              <div className="mt-3 grid gap-2 text-xs text-zinc-600">
                <div className="flex items-center justify-between"><span>Visibilidad</span><span className="font-mono">{repository.visibility}</span></div>
                <div className="flex items-center justify-between"><span>Acceso</span><span className="font-mono">{repository.gated ? "aprobación" : "directo"}</span></div>
                <div className="flex items-center justify-between"><span>Snapshot</span><span className="font-mono">inmutable</span></div>
              </div>
            </section>
            <section className="rounded-2xl border border-indigo-950/10 bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><GitCommitHorizontal className="size-4 text-indigo-500" /> Historial</h2>
              <div className="mt-3 grid gap-3">
                {revisions.slice(0, 10).map((revision) => (
                  <div key={revision.id} className="border-l-2 border-indigo-100 pl-3">
                    <div className="font-mono text-[11px] text-indigo-700">v{revision.revision} · {revision.commitSha}</div>
                    <div className="mt-0.5 text-xs text-zinc-600">{revision.commitMessage}</div>
                  </div>
                ))}
                {!revisions.length ? <p className="text-xs text-zinc-500">Sin commits visibles.</p> : null}
              </div>
            </section>
            <div className="flex items-center gap-2 px-1 text-xs text-zinc-500"><Download className="size-3.5" /> Las descargas públicas inmutables usan caché anual.</div>
          </aside>
        </div>
      </div>
    </MarketingShell>
  );
}
