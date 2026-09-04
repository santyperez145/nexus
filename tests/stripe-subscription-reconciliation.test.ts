import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-stripe-subscription-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let reconciliation: typeof import("../src/lib/billing/stripe-subscription");
let webhookEvents: typeof import("../src/lib/billing/stripe-webhook-event");

function subscription(input: {
  id: string;
  plan: "pro" | "team";
  status: string;
  customerId?: string;
}) {
  return {
    id: input.id,
    customer: input.customerId ?? "cus_reconcile",
    status: input.status,
    metadata: { userId: "usr_reconcile", planId: input.plan },
    items: {
      data: [
        {
          price: { id: `price_${input.plan}` },
          quantity: input.plan === "team" ? 5 : 1,
          current_period_start: 1_788_000_000,
          current_period_end: 1_790_000_000,
        },
      ],
    },
    cancel_at_period_end: false,
  } as unknown as Stripe.Subscription;
}

before(async () => {
  database = await import("../src/lib/db");
  reconciliation = await import("../src/lib/billing/stripe-subscription");
  webhookEvents = await import("../src/lib/billing/stripe-webhook-event");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: "usr_reconcile",
    name: "Stripe Customer",
    email: "stripe-reconcile@nexus.test",
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("Stripe webhook inbox", () => {
  it("claims once, records failure and allows an idempotent retry", async () => {
    const firstAttempt = new Date("2026-09-03T12:00:00.000Z");
    const input = {
      id: "evt_retry_once",
      eventType: "invoice.paid",
      stripeCreatedAt: new Date("2026-09-03T11:59:58.000Z"),
      now: firstAttempt,
    };
    assert.equal(await webhookEvents.claimStripeWebhookEvent(input), "claimed");
    assert.equal(await webhookEvents.claimStripeWebhookEvent(input), "already_processing");

    await webhookEvents.markStripeWebhookFailed(input.id, new Error("temporary Stripe lookup failure"));
    assert.equal(
      await webhookEvents.claimStripeWebhookEvent({
        ...input,
        now: new Date("2026-09-03T12:00:01.000Z"),
      }),
      "claimed",
    );
    await webhookEvents.markStripeWebhookProcessed(input.id, new Date("2026-09-03T12:00:02.000Z"));
    assert.equal(await webhookEvents.claimStripeWebhookEvent(input), "already_processed");

    const [stored] = await database.db
      .select()
      .from(database.schema.stripeWebhookEvents)
      .where(eq(database.schema.stripeWebhookEvents.id, input.id));
    assert.equal(stored.status, "processed");
    assert.equal(stored.attempts, 2);
    assert.equal(stored.lastError, null);
    assert.equal(stored.processedAt?.toISOString(), "2026-09-03T12:00:02.000Z");
  });

  it("reclaims an abandoned processing lease without duplicating a live attempt", async () => {
    const input = {
      id: "evt_stale_lease",
      eventType: "customer.subscription.updated",
      stripeCreatedAt: new Date("2026-09-03T12:10:00.000Z"),
      now: new Date("2026-09-03T12:10:01.000Z"),
    };
    assert.equal(await webhookEvents.claimStripeWebhookEvent(input), "claimed");
    assert.equal(
      await webhookEvents.claimStripeWebhookEvent({
        ...input,
        now: new Date("2026-09-03T12:14:59.000Z"),
      }),
      "already_processing",
    );
    assert.equal(
      await webhookEvents.claimStripeWebhookEvent({
        ...input,
        now: new Date("2026-09-03T12:15:02.000Z"),
      }),
      "claimed",
    );
  });
});

describe("Stripe subscription reconciliation", () => {
  it("retrieves canonical Stripe state instead of trusting an out-of-order webhook snapshot", async () => {
    const stale = subscription({ id: "sub_team", plan: "team", status: "canceled" });
    const canonical = subscription({ id: "sub_team", plan: "team", status: "active" });
    const stripe = {
      subscriptions: {
        retrieve: async (id: string) => {
          assert.equal(id, "sub_team");
          return canonical;
        },
      },
    } as unknown as Stripe;

    await reconciliation.reconcileStripeSubscription(stripe, stale);
    const [user] = await database.db
      .select()
      .from(database.schema.users)
      .where(eq(database.schema.users.id, "usr_reconcile"));
    assert.equal(user.plan, "team");
    assert.equal(user.subscriptionStatus, "active");
  });

  it("degrades only the failed subscription and preserves another active entitlement", async () => {
    await reconciliation.syncStripeSubscription(
      subscription({ id: "sub_pro", plan: "pro", status: "active" }),
    );
    await reconciliation.syncStripeSubscription(
      subscription({ id: "sub_team", plan: "team", status: "past_due" }),
    );

    const rows = await database.db
      .select()
      .from(database.schema.subscriptions)
      .where(eq(database.schema.subscriptions.userId, "usr_reconcile"));
    const [user] = await database.db
      .select()
      .from(database.schema.users)
      .where(eq(database.schema.users.id, "usr_reconcile"));
    assert.equal(rows.find((row) => row.id === "sub_team")?.status, "past_due");
    assert.equal(rows.find((row) => row.id === "sub_pro")?.status, "active");
    assert.equal(user.plan, "pro");
    assert.equal(user.subscriptionStatus, "active");
  });

  it("extracts current and legacy invoice subscription references", () => {
    assert.equal(
      reconciliation.subscriptionIdFromInvoice({
        parent: { subscription_details: { subscription: { id: "sub_parent" } } },
      } as unknown as Stripe.Invoice),
      "sub_parent",
    );
    assert.equal(
      reconciliation.subscriptionIdFromInvoice({ subscription: "sub_legacy" } as unknown as Stripe.Invoice),
      "sub_legacy",
    );
  });
});
