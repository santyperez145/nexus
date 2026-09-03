import { allModels } from "@/lib/catalog";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";
import { isProviderNoTrainingConfirmed, isProviderZdrConfirmed } from "@/lib/providers/privacy";
import { recentOperationalProviderIds } from "@/lib/providers/health-store";

export async function GET() {
  const live = new Set(wiredProviders().map((p) => p.id));
  let operational = new Set<string>();
  try {
    operational = await recentOperationalProviderIds();
  } catch {
    operational = new Set();
  }
  const counts = new Map<string, number>();
  for (const m of allModels()) {
    for (const e of m.endpoints) {
      counts.set(e.adapter, (counts.get(e.adapter) ?? 0) + 1);
    }
  }
  return Response.json({
    data: NEXUS_PROVIDERS.map((p) => ({
      name: p.id,
      slug: p.id,
      label: p.label,
      kind: p.kind,
      wired: live.has(p.id),
      operational: operational.has(p.id),
      model_count: counts.get(p.id) ?? 0,
      privacy_policy_url: null,
      terms_of_service_url: null,
      status_page_url: null,
      zdr: isProviderZdrConfirmed(p.id),
      zdr_capable: Boolean(p.zdr),
      no_training: isProviderNoTrainingConfirmed(p.id),
    })),
  });
}
