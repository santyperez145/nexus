import { MarketingShell } from "@/components/layout/marketing-shell";
import { MarketingPageHeader } from "@/components/layout/marketing-page-header";
import { ArenaClient } from "@/components/models/arena-client";
import {
  allModels,
  hasExecutableEndpoint,
  isTextGenerationModel,
} from "@/lib/catalog";
import { getSession } from "@/lib/auth";
import { guestPlaygroundEnabled } from "@/lib/config";

export default async function ArenaPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const q = await searchParams;
  const session = await getSession();
  const guest = !session?.user && guestPlaygroundEnabled();
  const models = allModels()
    .filter(
      (model) =>
        (isTextGenerationModel(model) && hasExecutableEndpoint(model)) ||
        model.id === "nexus/auto" ||
        model.id === "nexus/free",
    )
    .map((m) => m.id);
  const defaultA = q.a && models.includes(q.a) ? q.a : models.includes("nexus/auto") ? "nexus/auto" : models[0];
  const defaultB =
    q.b && models.includes(q.b) && q.b !== defaultA
      ? q.b
      : models.find((id) => id !== defaultA) ?? defaultA;

  return (
    <MarketingShell>
      <div className="relative mx-auto max-w-5xl px-4 py-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-6 h-40 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08),_transparent_70%)]"
        />
        <MarketingPageHeader title="Arena de modelos">
          Enviá la misma consigna a dos modelos, compará sus respuestas sin sesgos y elegí cuál
          resuelve mejor tu necesidad.
        </MarketingPageHeader>
        <ArenaClient
          defaultA={defaultA}
          defaultB={defaultB}
          models={models.slice(0, 200)}
          guest={guest}
          authenticated={Boolean(session?.user)}
        />
      </div>
    </MarketingShell>
  );
}
