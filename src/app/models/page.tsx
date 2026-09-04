import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ModelsExplorer } from "@/components/models/models-explorer";
import { Button } from "@/components/ui/button";
import { hasExecutableEndpoint } from "@/lib/catalog";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { isModelExecutionReady } from "@/lib/catalog/presentation";
import { ensureDb } from "@/lib/db";
import { listModelRepositories } from "@/lib/hub/model-repository-store";
import { modelRepositoryModalities } from "@/lib/hub/model-repositories";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";
import Link from "next/link";

const MODS = new Set(["all", "text", "image", "video", "audio", "embeddings"]);

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{
    mod?: string;
    free?: string;
    author?: string;
    lab?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await ensureDb();
  const q = await searchParams;
  const initialMod = MODS.has(q.mod ?? "")
    ? (q.mod as "all" | "text" | "image" | "video" | "audio" | "embeddings")
    : "all";
  const sortOk = new Set(["new", "price", "context", "latency"]);
  const initialSort = sortOk.has(q.sort ?? "")
    ? (q.sort as "new" | "price" | "context" | "latency")
    : "new";
  const requestedPage = Number.parseInt(q.page ?? "1", 10);
  const initialPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [hubModels, runtimeModels] = await Promise.all([
    listModelRepositories({ limit: 100 }),
    allRuntimeModels(),
  ]);
  const catalogModels = runtimeModels.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    author: m.author,
    free: m.free,
    pricingVerified: hasExecutableEndpoint(m),
    executable: isModelExecutionReady(m),
    created: m.created,
    contextLength: m.contextLength,
    output: m.architecture.outputModalities,
    input: m.architecture.inputModalities,
    pricing: {
      prompt: m.pricing.prompt,
      completion: m.pricing.completion,
      image: m.pricing.image,
      request: m.pricing.request,
    },
    endpoints: m.endpoints.map((e) => ({
      adapter: e.adapter,
      zdr: isEndpointZdrConfirmed(e),
    })),
    source: "gateway" as const,
  }));
  const repositoryModels = hubModels.map((repository) => {
    const modalities = modelRepositoryModalities(repository.task);
    return {
      id: `${repository.namespace}/${repository.slug}`,
      name: repository.title,
      description: repository.description || "Repositorio de modelo publicado en Nexus Hub.",
      author: repository.namespace,
      free: false,
      pricingVerified: false,
      executable: false,
      created: Math.floor(repository.createdAt.getTime() / 1000),
      contextLength: 0,
      output: modalities.output,
      input: modalities.input,
      pricing: { prompt: 0, completion: 0, image: 0, request: 0 },
      endpoints: [],
      source: "hub" as const,
      latestRevision: repository.latestRevision,
      downloads: repository.downloads,
    };
  });
  const models = [...catalogModels, ...repositoryModels];
  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <MarketingPageHeader title="Catálogo y Hub de modelos" className="mb-0">
            Ejecutá modelos verificados de múltiples proveedores o publicá repositorios versionados.
            Los artefactos del Hub permanecen fuera del routing hasta superar verificación operativa.
          </MarketingPageHeader>
          <Button asChild className="mb-1 rounded-full px-4">
            <Link href="/settings/models">Publicar modelo</Link>
          </Button>
        </div>
        <section className="nexus-console-grid mb-7 mt-8 overflow-hidden rounded-2xl border border-indigo-950/15 bg-[#0b0e1a] text-white shadow-[0_18px_70px_rgba(17,19,38,0.14)]">
          <div className="grid gap-px bg-white/10 sm:grid-cols-3">
            {[
              ["Rutas ejecutables", models.filter((model) => model.executable).length],
              ["Repositorios Hub", hubModels.length],
              ["Límite de confianza", "verificación manual"],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-[#0b0e1a]/95 px-5 py-5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
                <div className="mt-2 font-mono text-lg text-cyan-100">{value}</div>
              </div>
            ))}
          </div>
        </section>
        <ModelsExplorer
          models={models}
          initialMod={initialMod}
          initialFree={q.free === "1" || q.free === "true"}
          initialAuthor={q.author ?? "all"}
          initialLab={q.lab ?? "all"}
          initialSort={initialSort}
          initialPage={initialPage}
        />
      </div>
    </MarketingShell>
  );
}
