import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
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
    <div className="min-h-screen bg-zinc-950">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-2 text-3xl font-semibold">Models</h1>
        <p className="mb-8 text-zinc-500">
          Un slug, varios labs. Filtrá por modalidad; el gateway elige host por precio, latencia o{" "}
          <code>provider.only</code>.
        </p>
        <ModelsExplorer models={models} />
      </div>
      <SiteFooter />
    </div>
  );
}
