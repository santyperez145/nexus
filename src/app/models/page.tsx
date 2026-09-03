import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ModelsExplorer } from "@/components/models/models-explorer";
import { allModels } from "@/lib/catalog";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";

const MODS = new Set(["all", "text", "image", "video", "audio", "embeddings"]);

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; free?: string; author?: string; lab?: string; sort?: string }>;
}) {
  const q = await searchParams;
  const initialMod = MODS.has(q.mod ?? "")
    ? (q.mod as "all" | "text" | "image" | "video" | "audio" | "embeddings")
    : "all";
  const sortOk = new Set(["new", "price", "context", "latency"]);
  const initialSort = sortOk.has(q.sort ?? "")
    ? (q.sort as "new" | "price" | "context" | "latency")
    : "new";
  const models = allModels().map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    author: m.author,
    free: m.free,
    created: m.created,
    contextLength: m.contextLength,
    output: m.architecture.outputModalities,
    input: m.architecture.inputModalities,
    pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
    endpoints: m.endpoints.map((e) => ({
      adapter: e.adapter,
      zdr: isEndpointZdrConfirmed(e),
      verified: Boolean(m.verified || e.verified),
    })),
  }));
  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <MarketingPageHeader title="Catálogo de modelos">
          Encontrá el modelo ideal por capacidad, creador, precio y velocidad. Compará alternativas
          y empezá a usarlas desde una sola cuenta.
        </MarketingPageHeader>
        <ModelsExplorer
          models={models}
          initialMod={initialMod}
          initialFree={q.free === "1" || q.free === "true"}
          initialAuthor={q.author ?? "all"}
          initialLab={q.lab ?? "all"}
          initialSort={initialSort}
        />
      </div>
    </MarketingShell>
  );
}
