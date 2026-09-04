import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { CompareClient } from "@/components/models/compare-client";
import {
  allModels,
  hasExecutableEndpoint,
  isTextGenerationModel,
} from "@/lib/catalog";
import { isEndpointZdrConfirmed } from "@/lib/providers/privacy";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const q = await searchParams;
  const models = allModels()
    .filter((model) => !model.id.startsWith("nexus/") && isTextGenerationModel(model))
    .map((m) => ({
    id: m.id,
    name: m.name,
    contextLength: m.contextLength,
    free: m.free,
    pricingVerified: hasExecutableEndpoint(m),
    pricing: { prompt: m.pricing.prompt, completion: m.pricing.completion },
    endpoints: m.endpoints.map((e) => ({
      adapter: e.adapter,
      latencyMs: e.latencyMs,
      throughputTps: e.throughputTps,
      measured: e.metricsEstimated === false,
      zdr: isEndpointZdrConfirmed(e),
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
        <MarketingPageHeader title="Comparar modelos">
          Elegí dos modelos y compará precio, capacidad, velocidad y privacidad antes de usarlos en
          tu aplicación.
        </MarketingPageHeader>
        <CompareClient models={ordered} initialA={q.a} initialB={q.b} />
      </div>
    </MarketingShell>
  );
}
