import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ModelsExplorer } from "@/components/models/models-explorer";
import { allModels } from "@/lib/catalog";

const MODS = new Set(["all", "text", "image", "video", "audio", "embeddings"]);

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ mod?: string; free?: string; author?: string; lab?: string }>;
}) {
  const q = await searchParams;
  const initialMod = MODS.has(q.mod ?? "")
    ? (q.mod as "all" | "text" | "image" | "video" | "audio" | "embeddings")
    : "all";
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
          Un slug, varios labs. Filtrá por modalidad, free, autor o host; el gateway elige por precio,
          latencia o <code className="text-zinc-700">provider.only</code>. Media en{" "}
          <a href="/studio" className="text-amber-700 hover:underline">
            Studio
          </a>
          .
        </MarketingPageHeader>
        <ModelsExplorer
          models={models}
          initialMod={initialMod}
          initialFree={q.free === "1" || q.free === "true"}
          initialAuthor={q.author ?? "all"}
          initialLab={q.lab ?? "all"}
        />
      </div>
    </MarketingShell>
  );
}
