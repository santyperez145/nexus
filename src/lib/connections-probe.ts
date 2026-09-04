import { probeAndPersistPlatformHealth } from "@/lib/providers/health-store";

type Probe = { ok: boolean; status?: number; detail: string };

export async function probeConnections() {
  const { providers: providerProbes, managedProviders, stripe } = await probeAndPersistPlatformHealth();
  const labs = Object.entries(providerProbes).map(([provider, result]) => [
    provider,
    { ok: result.ok, status: result.status, detail: result.detail } as Probe,
  ] as const);

  return {
    ...Object.fromEntries(labs),
    ...managedProviders,
    stripe: { ok: stripe.ok, status: stripe.status, detail: stripe.detail } as Probe,
  };
}
