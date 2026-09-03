import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ModelsExplorer } from "@/components/models/models-explorer";
import { allModels } from "@/lib/catalog";

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
    pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
    endpoints: m.endpoints.map((e) => ({ adapter: e.adapter })),
  }));
  return (
    <MarketingShell>
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Models">
          Un slug, varios labs. Filtrá por modalidad, free, autor o host; ordená por precio, contexto o
          latencia medida. Marcá 2 para Compare.
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
