import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ModelsExplorer } from "@/components/models/models-explorer";
import { allModels } from "@/lib/catalog";

export default function ModelsPage() {
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
          Un slug, varios labs. Filtrá por modalidad; el gateway elige host por precio, latencia o{" "}
          <code className="text-zinc-700">provider.only</code>.
        </MarketingPageHeader>
        <ModelsExplorer models={models} />
      </div>
    </MarketingShell>
  );
}
