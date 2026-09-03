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
    input: m.architecture.inputModalities,
    pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
    endpoints: m.endpoints.map((e) => ({ adapter: e.adapter, zdr: Boolean(e.zdr) })),
  }));
  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(217,119,6,0.1),_transparent_70%)]"
        />
        <MarketingPageHeader title="Models">
          Un slug, varios labs. Trending 30d real · filtros por modalidad / free / autor / host ·
          badges vision/ZDR · Try + Compare.
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
