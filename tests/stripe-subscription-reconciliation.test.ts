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
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: "usr_reconcile",
    name: "Stripe Customer",
    email: "stripe-reconcile@nexus.test",
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

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
