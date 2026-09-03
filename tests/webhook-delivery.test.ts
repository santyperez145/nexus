import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-webhook-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let dispatch: typeof import("../src/lib/observability/dispatch");

before(async () => {
  database = await import("../src/lib/db");
  dispatch = await import("../src/lib/observability/dispatch");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: "usr_webhook",
    name: "Webhook Test",
    email: "webhook@nexus.test",
  });
  await database.db.insert(database.schema.observabilityDestinations).values({
    id: "obs_webhook",
    userId: "usr_webhook",
    type: "webhook",
    name: "Blocked target",
    config: { url: "http://127.0.0.1/internal", secret: "nxs_test" },
  });
  await database.db.insert(database.schema.users).values({
    id: "usr_workspace_owner",
    name: "Workspace Owner",
    email: "workspace-owner@nexus.test",
  });
  await database.db.insert(database.schema.workspaces).values({
    id: "ws_webhook",
    userId: "usr_workspace_owner",
    name: "Shared webhooks",
    slug: "shared-webhooks",
  });
  await database.db.insert(database.schema.observabilityDestinations).values({
    id: "obs_workspace_webhook",
    userId: "usr_workspace_owner",
    workspaceId: "ws_webhook",
    type: "webhook",
    name: "Workspace target",
    config: { url: "http://127.0.0.1/shared" },
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("durable observability delivery", () => {
  it("persists failures and claims the next retry exactly once", async () => {
    await dispatch.dispatchGenerationWebhook("usr_webhook", { id: "gen_webhook" });
    const [failed] = await database.db.select().from(database.schema.webhookDeliveries);
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 1);
    assert.match(failed.lastError ?? "", /public host/);

    await database.db
      .update(database.schema.webhookDeliveries)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(database.schema.webhookDeliveries.id, failed.id));
    assert.equal(await dispatch.retryWebhookDeliveries(), 1);
    assert.equal(await dispatch.retryWebhookDeliveries(), 0);

    const [retried] = await database.db.select().from(database.schema.webhookDeliveries);
    assert.equal(retried.status, "failed");
    assert.equal(retried.attempts, 2);

    await database.db
      .update(database.schema.webhookDeliveries)
      .set({ status: "processing", lastAttemptAt: new Date(0), nextAttemptAt: new Date(Date.now() + 86_400_000) })
      .where(eq(database.schema.webhookDeliveries.id, failed.id));
    assert.equal(await dispatch.retryWebhookDeliveries(), 1);
    const [recovered] = await database.db.select().from(database.schema.webhookDeliveries);
    assert.equal(recovered.status, "failed");
    assert.equal(recovered.attempts, 3);
  });

  it("dispatches workspace destinations for shared-tenant inference", async () => {
    await dispatch.dispatchGenerationWebhook("usr_webhook", { id: "gen_shared" }, "ws_webhook");
    const rows = await database.db.select().from(database.schema.webhookDeliveries);
    const destinationIds = rows.map((row) => row.destinationId);
    assert.ok(destinationIds.includes("obs_webhook"));
    assert.ok(destinationIds.includes("obs_workspace_webhook"));
  });
});
