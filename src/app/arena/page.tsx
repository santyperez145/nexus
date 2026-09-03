import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ArenaClient } from "@/components/models/arena-client";
import { allModels } from "@/lib/catalog";

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const q = await searchParams;
  const models = allModels()
    .filter((m) => !m.id.startsWith("nexus/") || m.id === "nexus/auto" || m.id === "nexus/free")
    .map((m) => m.id);
  const defaultA = q.a && models.includes(q.a) ? q.a : models.includes("nexus/auto") ? "nexus/auto" : models[0];
  const defaultB =
    q.b && models.includes(q.b) && q.b !== defaultA
      ? q.b
      : models.find((id) => id !== defaultA) ?? defaultA;

  return (
    <MarketingShell>
      <div className="mx-auto max-w-5xl px-4 py-12 md:py-16">
        <MarketingPageHeader title="Arena">
          Un prompt, dos modelos, un voto. Los resultados viven en tu browser — sin ranking global
          inventado ni tracción fake.
        </MarketingPageHeader>
        <ArenaClient defaultA={defaultA} defaultB={defaultB} models={models.slice(0, 200)} />
      </div>
    </MarketingShell>
  );
}
