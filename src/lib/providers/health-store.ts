import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { NEXUS_PROVIDERS, isWired } from "./registry";
import { isRecentHealthy, probeProvider } from "./probe";
import { probeStripe } from "@/lib/billing/stripe-probe";

export async function readProviderHealthRows() {
  await ensureDb();
  return db
    .select({
      provider: schema.providerHealth.provider,
      status: schema.providerHealth.status,
      latencyMs: schema.providerHealth.latencyMs,
      lastCheck: schema.providerHealth.lastCheck,
    })
    .from(schema.providerHealth);
}

export async function recentOperationalProviderIds() {
  const configured = new Set(NEXUS_PROVIDERS.filter(isWired).map((provider) => provider.id));
  const rows = await readProviderHealthRows();
  return new Set(
    rows
      .filter((row) => configured.has(row.provider) && isRecentHealthy(row))
      .map((row) => row.provider),
  );
}

export async function isStripeOperational() {
  const rows = await readProviderHealthRows();
  const row = rows.find((candidate) => candidate.provider === "stripe");
  return Boolean(row && isRecentHealthy(row));
}

async function persistHealth(
  provider: string,
  probe: { ok: boolean; latencyMs: number; detail: string },
) {
  const checkedAt = new Date();
  await db
    .insert(schema.providerHealth)
    .values({
      id: id("ph"),
      provider,
      status: probe.ok ? "up" : "down",
      latencyMs: probe.latencyMs,
      lastCheck: checkedAt,
      detail: probe.detail,
    })
    .onConflictDoUpdate({
      target: schema.providerHealth.provider,
      set: {
        status: probe.ok ? "up" : "down",
        latencyMs: probe.latencyMs,
        lastCheck: checkedAt,
        detail: probe.detail,
      },
    });
}

export async function probeAndPersistProviders() {
  await ensureDb();
  const entries = await Promise.all(
    NEXUS_PROVIDERS.map(async (provider) => [provider, await probeProvider(provider)] as const),
  );
  await Promise.all(entries.map(([provider, probe]) => persistHealth(provider.id, probe)));
  return Object.fromEntries(entries.map(([provider, probe]) => [provider.id, probe]));
}

export async function probeAndPersistStripe() {
  await ensureDb();
  const probe = await probeStripe();
  await persistHealth("stripe", probe);
  return probe;
}

export async function probeAndPersistPlatformHealth() {
  const [providers, stripe] = await Promise.all([
    probeAndPersistProviders(),
    probeAndPersistStripe(),
  ]);
  return { providers, stripe };
}
