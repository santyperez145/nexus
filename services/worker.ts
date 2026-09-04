/**
 * Nexus Worker — catálogo oficial de labs + health probes.
 */
import { syncCatalog } from "../src/lib/catalog/sync";
import { db, ensureDb, schema } from "../src/lib/db";
import { id } from "../src/lib/ids";
import { retryWebhookDeliveries } from "../src/lib/observability/dispatch";
import { probeAndPersistPlatformHealth } from "../src/lib/providers/health-store";
import { cleanupExpiredArtifactUploads } from "../src/lib/files/store";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);
const WEBHOOK_RETRY_INTERVAL_MS = Number(process.env.WEBHOOK_RETRY_INTERVAL_MS ?? 60 * 1000);
const HEALTH_PROBE_INTERVAL_MS = Number(process.env.HEALTH_PROBE_INTERVAL_MS ?? 15 * 60 * 1000);
const once = process.argv.includes("--once");

async function tickCatalog() {
  const catalog = await syncCatalog();
  await ensureDb();
  await db.insert(schema.catalogSnapshots).values({
    id: id("cat"),
    source: catalog.source,
    modelCount: catalog.count,
  });
  console.log(`[worker] catalog=${catalog.count} at ${catalog.fetchedAt}`);
}

async function tickHealth() {
  const result = await probeAndPersistPlatformHealth();
  const verified = Object.values(result.providers).filter((probe) => probe.ok).length;
  console.log(`[worker] providers=${verified} stripe=${result.stripe.ok ? "up" : "down"}`);
}

async function tickWebhooks() {
  await ensureDb();
  const retried = await retryWebhookDeliveries();
  if (retried) console.log(`[worker] webhook_retries=${retried}`);
}

async function tickArtifacts() {
  await ensureDb();
  const result = await cleanupExpiredArtifactUploads();
  if (result.claimed) {
    console.log(`[worker] artifact_uploads_cleaned=${result.cleaned} failed=${result.failed}`);
  }
}

async function main() {
  await Promise.all([tickCatalog(), tickHealth(), tickWebhooks(), tickArtifacts()]);
  if (once) {
    process.exit(0);
  }
  setInterval(() => {
    void tickCatalog().catch((err) => console.error("[worker:catalog]", err));
  }, INTERVAL_MS);
  setInterval(() => {
    void tickWebhooks().catch((err) => console.error("[worker:webhooks]", err));
  }, WEBHOOK_RETRY_INTERVAL_MS);
  setInterval(() => {
    void tickHealth().catch((err) => console.error("[worker:health]", err));
  }, HEALTH_PROBE_INTERVAL_MS);
  setInterval(() => {
    void tickArtifacts().catch((err) => console.error("[worker:artifacts]", err));
  }, WEBHOOK_RETRY_INTERVAL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
