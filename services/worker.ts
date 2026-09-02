/**
 * Nexus Worker — catálogo oficial de labs + health probes.
 */
import { syncCatalog } from "../src/lib/catalog/sync";
import { db, ensureDb, schema } from "../src/lib/db";
import { id } from "../src/lib/ids";
import { eq } from "drizzle-orm";
import {
  NEXUS_PROVIDERS,
  authHeaders,
  envFor,
  isWired,
  modelsUrl,
} from "../src/lib/providers/registry";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);
const once = process.argv.includes("--once");

async function probeProviders() {
  await ensureDb();
  for (const p of NEXUS_PROVIDERS) {
    if (!isWired(p)) continue;
    const key = envFor(p);
    if (!key) continue;
    const started = Date.now();
    let status = "up";
    let detail = "ok";
    try {
      const res = await fetch(modelsUrl(p, key), {
        method: "GET",
        headers: authHeaders(p, key),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status >= 500) {
        status = "down";
        detail = `HTTP ${res.status}`;
      } else {
        detail = `HTTP ${res.status}`;
      }
    } catch (error) {
      status = "down";
      detail = error instanceof Error ? error.message : "error";
    }
    const latencyMs = Date.now() - started;
    const existing = await db
      .select()
      .from(schema.providerHealth)
      .where(eq(schema.providerHealth.provider, p.id))
      .limit(1);
    if (existing[0]) {
      await db
        .update(schema.providerHealth)
        .set({ status, latencyMs, lastCheck: new Date(), detail })
        .where(eq(schema.providerHealth.provider, p.id));
    } else {
      await db.insert(schema.providerHealth).values({
        id: id("ph"),
        provider: p.id,
        status,
        latencyMs,
        detail,
      });
    }
  }
}

async function tick() {
  const catalog = await syncCatalog();
  await ensureDb();
  await db.insert(schema.catalogSnapshots).values({
    id: id("cat"),
    source: catalog.source,
    modelCount: catalog.count,
  });
  await probeProviders();
  console.log(`[worker] catalog=${catalog.count} at ${catalog.fetchedAt}`);
}

async function main() {
  await tick();
  if (once) {
    process.exit(0);
  }
  setInterval(() => {
    void tick().catch((err) => console.error("[worker]", err));
  }, INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
