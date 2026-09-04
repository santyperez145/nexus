import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-stripe-subscription-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro";
process.env.STRIPE_PRICE_TEAM_MONTHLY = "price_team";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let reconciliation: typeof import("../src/lib/billing/stripe-subscription");
let webhookEvents: typeof import("../src/lib/billing/stripe-webhook-event");
let stripeCredit: typeof import("../src/lib/billing/stripe-credit");

function subscription(input: {
  id: string;
  plan: "pro" | "team";
  status: string;
  customerId?: string;
  userId?: string;
  pricePlan?: "pro" | "team";
  priceId?: string;
}) {
  return {
    id: input.id,
    customer: input.customerId ?? "cus_reconcile",
    status: input.status,
    metadata: { userId: input.userId ?? "usr_reconcile", planId: input.plan },
    items: {
      data: [
        {
          price: { id: input.priceId ?? `price_${input.pricePlan ?? input.plan}` },
          quantity: (input.pricePlan ?? input.plan) === "team" ? 5 : 1,
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
  stripeCredit = await import("../src/lib/billing/stripe-credit");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: "usr_reconcile",
    name: "Stripe Customer",
    email: "stripe-reconcile@nexus.test",
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("Stripe webhook inbox", () => {
  it("classifies included plan credits separately from paid wallet top-ups", async () => {
    assert.deepEqual(
      await stripeCredit.creditPurchaseOnce({
        userId: "usr_reconcile",
        creditsUsd: 5,
        stripeSessionId: "in_plan_credit",
        ledgerType: "subscription_credit",
        note: "Pro: créditos mensuales incluidos",
      }),
      { credited: true, micros: 5_000_000 },
    );
    assert.deepEqual(
      await stripeCredit.creditPurchaseOnce({
        userId: "usr_reconcile",
        creditsUsd: 5,
        stripeSessionId: "in_plan_credit",
        ledgerType: "subscription_credit",
      }),
      { credited: false, micros: 0 },
    );
    const [stored] = await database.db
      .select()
      .from(database.schema.creditLedger)
      .where(eq(database.schema.creditLedger.stripeSessionId, "in_plan_credit"));
    assert.equal(stored.type, "subscription_credit");
  });

  it("backfills historical included credits without reclassifying top-ups", async () => {
    await database.db.insert(database.schema.creditLedger).values([
      {
        id: "led_historical_plan",
        userId: "usr_reconcile",
        type: "purchase",
        micros: 5_000_000,
        stripeSessionId: "in_historical_plan",
        note: "Pro: créditos mensuales incluidos",
      },
      {
        id: "led_historical_topup",
        userId: "usr_reconcile",
        type: "purchase",
        micros: 10_000_000,
        stripeSessionId: "cs_historical_topup",
        note: "Compra Stripe 10 USD",
      },
    ]);
    const migration = readFileSync(
      join(process.cwd(), "drizzle", "0007_classify_subscription_credits.sql"),
      "utf8",
    );
    await database.db.execute(sql.raw(migration));
    const rows = await database.db
      .select()
      .from(database.schema.creditLedger)
      .where(eq(database.schema.creditLedger.userId, "usr_reconcile"));
    assert.equal(rows.find((row) => row.id === "led_historical_plan")?.type, "subscription_credit");
    assert.equal(rows.find((row) => row.id === "led_historical_topup")?.type, "purchase");
  });

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

  it("derives portal plan changes from the billed Price instead of stale metadata", async () => {
    await reconciliation.syncStripeSubscription(
      subscription({
        id: "sub_portal_upgrade",
        plan: "pro",
        pricePlan: "team",
        status: "active",
      }),
    );
    const [stored] = await database.db
      .select()
      .from(database.schema.subscriptions)
      .where(eq(database.schema.subscriptions.id, "sub_portal_upgrade"));
    assert.equal(stored.plan, "team");
    assert.equal(stored.priceId, "price_team");
    assert.equal(stored.quantity, 5);
  });

  it("does not grant an entitlement for an unknown Price even when metadata names a plan", async () => {
    const result = await reconciliation.syncStripeSubscription(
      subscription({
        id: "sub_unknown_price",
        plan: "team",
        priceId: "price_untrusted",
        status: "active",
      }),
    );
    assert.equal(result, null);
    const rows = await database.db
      .select()
      .from(database.schema.subscriptions)
      .where(eq(database.schema.subscriptions.id, "sub_unknown_price"));
    assert.equal(rows.length, 0);
  });

  it("revokes a prior entitlement when Stripe changes it to an unknown Price", async () => {
    await database.db.insert(database.schema.users).values({
      id: "usr_price_revoked",
      name: "Revoked Price Customer",
      email: "stripe-revoked@nexus.test",
    });
    await reconciliation.syncStripeSubscription(
      subscription({
        id: "sub_price_revoked",
        plan: "pro",
        status: "active",
        customerId: "cus_price_revoked",
        userId: "usr_price_revoked",
      }),
    );
    await reconciliation.syncStripeSubscription(
      subscription({
        id: "sub_price_revoked",
        plan: "pro",
        priceId: "price_untrusted",
        status: "active",
        customerId: "cus_price_revoked",
        userId: "usr_price_revoked",
      }),
    );
    const [stored] = await database.db
      .select()
      .from(database.schema.subscriptions)
      .where(eq(database.schema.subscriptions.id, "sub_price_revoked"));
    const [user] = await database.db
      .select()
      .from(database.schema.users)
      .where(eq(database.schema.users.id, "usr_price_revoked"));
    assert.equal(stored.status, "unmapped_price");
    assert.equal(stored.priceId, "price_untrusted");
    assert.equal(user.plan, "free");
    assert.equal(user.subscriptionStatus, "unmapped_price");
  });

  it("enforces one Stripe customer owner at the database boundary", async () => {
    await database.db.insert(database.schema.users).values({
      id: "usr_customer_owner",
      name: "Stripe Customer Owner",
      email: "stripe-owner@nexus.test",
      stripeCustomerId: "cus_unique_owner",
    });
    await assert.rejects(
      database.db.insert(database.schema.users).values({
        id: "usr_duplicate_customer",
        name: "Duplicate Stripe Customer",
        email: "stripe-duplicate@nexus.test",
        stripeCustomerId: "cus_unique_owner",
      }),
    );
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

  it("grants monthly credits only on subscription creation and renewal", () => {
    assert.equal(
      reconciliation.invoiceGrantsIncludedCredits({
        billing_reason: "subscription_create",
      } as Stripe.Invoice),
      true,
    );
    assert.equal(
      reconciliation.invoiceGrantsIncludedCredits({
        billing_reason: "subscription_cycle",
      } as Stripe.Invoice),
      true,
    );
    assert.equal(
      reconciliation.invoiceGrantsIncludedCredits({
        billing_reason: "subscription_update",
      } as Stripe.Invoice),
      false,
    );
    assert.equal(
      reconciliation.invoiceGrantsIncludedCredits({} as Stripe.Invoice),
      false,
    );
  });
});
