import { cache } from "@/lib/redis";
import { NEXUS_PROVIDERS } from "@/lib/providers/registry";

const FAIL_THRESHOLD = 3;
const OPEN_SECONDS = 30;

export async function isCircuitOpen(provider: string) {
  const redis = await cache();
  const state = await redis.get(`cb:${provider}`);
  return state === "open";
}

export async function recordSuccess(provider: string) {
  const redis = await cache();
  await redis.set(`cb:${provider}:fails`, "0", 120);
  await redis.set(`cb:${provider}`, "closed", 120);
}

export async function recordFailure(provider: string) {
  const redis = await cache();
  const fails = await redis.incr(`cb:${provider}:fails`, 120);
  if (fails >= FAIL_THRESHOLD) {
    await redis.set(`cb:${provider}`, "open", OPEN_SECONDS);
  }
}

export async function providerSnapshot() {
  const names = NEXUS_PROVIDERS.map((p) => p.id);
  const redis = await cache();
  const rows = await Promise.all(
    names.map(async (name) => ({
      name,
      circuit: (await redis.get(`cb:${name}`)) ?? "closed",
      failures: Number((await redis.get(`cb:${name}:fails`)) ?? 0),
    })),
  );
  return rows;
}
