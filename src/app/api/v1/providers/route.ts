import { allRuntimeModels } from "@/lib/catalog/runtime";
import { NEXUS_PROVIDERS, wiredProviders } from "@/lib/providers/registry";
import { isProviderNoTrainingConfirmed, isProviderZdrConfirmed } from "@/lib/providers/privacy";
import { recentOperationalProviderIds } from "@/lib/providers/health-store";
import { listPublicManagedProviders } from "@/lib/providers/onboarding";

export async function GET() {
  const live = new Set(wiredProviders().map((p) => p.id));
  let operational = new Set<string>();
  let managed: Awaited<ReturnType<typeof listPublicManagedProviders>> = [];
  try {
    [operational, managed] = await Promise.all([
      recentOperationalProviderIds(),
      listPublicManagedProviders(),
    ]);
  } catch {
    operational = new Set();
    managed = [];
  }
  const counts = new Map<string, number>();
  for (const m of await allRuntimeModels()) {
    for (const e of m.endpoints) {
      counts.set(e.adapter, (counts.get(e.adapter) ?? 0) + 1);
    }
  }
  return Response.json({
    data: [
      ...NEXUS_PROVIDERS.map((p) => ({
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
        managed: false,
      })),
      ...managed.map((provider) => ({
        name: provider.id,
        slug: provider.id,
        label: provider.label,
        kind: provider.kind,
        wired: true,
        operational: provider.operational,
        model_count: counts.get(provider.id) ?? provider.modelCount,
        privacy_policy_url: provider.privacyPolicyUrl,
        terms_of_service_url: provider.termsUrl,
        status_page_url: provider.statusPageUrl,
        zdr: provider.zdr,
        zdr_capable: provider.zdrCapable,
        no_training: provider.noTraining,
        managed: true,
      })),
    ],
  });
}
