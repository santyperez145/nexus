import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { CompareClient } from "@/components/models/compare-client";
import { allModels } from "@/lib/catalog";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const q = await searchParams;
  const models = allModels().map((m) => ({
    id: m.id,
    name: m.name,
    contextLength: m.contextLength,
    free: m.free,
    pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
    endpoints: m.endpoints.map((e) => ({
      adapter: e.adapter,
      latencyMs: e.latencyMs,
      throughputTps: e.throughputTps,
      zdr: e.zdr,
    })),
    output: m.architecture.outputModalities,
  }));

  // Prefer query picks if present by reordering
  const ordered = [...models];
  if (q.a) {
    const i = ordered.findIndex((m) => m.id === q.a);
    if (i > 0) {
      const [row] = ordered.splice(i, 1);
      ordered.unshift(row);
    }
  }
  if (q.b) {
    const i = ordered.findIndex((m) => m.id === q.b);
    if (i >= 0) {
      const [row] = ordered.splice(i, 1);
      ordered.splice(1, 0, row);
    }
  }

  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Compare">
          Precio, contexto, labs y latencia lado a lado — datos del catálogo Nexus, sin métricas
          inventadas. Para correr prompts en paralelo: Chat.
        </MarketingPageHeader>
        <CompareClient models={ordered} />
      </div>
    </MarketingShell>
  );
}
