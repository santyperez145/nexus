import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-stripe-reversal-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

let database: typeof import("../src/lib/db");
let credit: typeof import("../src/lib/billing/stripe-credit");

before(async () => {
  database = await import("../src/lib/db");
  credit = await import("../src/lib/billing/stripe-credit");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values([
    { id: "usr_refunds", name: "Refunds", email: "refunds@nexus.test" },
    { id: "usr_disputes", name: "Disputes", email: "disputes@nexus.test" },
    { id: "usr_debt", name: "Debt", email: "debt@nexus.test" },
  ]);
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

async function balance(userId: string) {
  const [user] = await database.db
    .select({ micros: database.schema.users.creditMicros })
    .from(database.schema.users)
    .where(eq(database.schema.users.id, userId));
  return user.micros;
}

describe("Stripe wallet reversals", () => {
  it("removes multiple partial refunds exactly once and reaches zero on a full refund", async () => {
    await credit.creditPurchaseOnce({
      userId: "usr_refunds",
      creditsUsd: 10,
      stripeSessionId: "cs_refunds",
      stripePaymentIntentId: "pi_refunds",
      stripeAmountMinor: 1080,
      stripeCurrency: "usd",
    });
    assert.deepEqual(
      await credit.creditPurchaseOnce({
        userId: "usr_refunds",
        creditsUsd: 10,
        stripeSessionId: "cs_refunds_retry",
        stripePaymentIntentId: "pi_refunds",
        stripeAmountMinor: 1080,
        stripeCurrency: "usd",
      }),
      { credited: false, micros: 0 },
    );

    const first = await credit.reverseStripeRefundOnce({
      refundId: "re_partial_a",
      paymentIntentId: "pi_refunds",
      amountMinor: 400,
      currency: "usd",
    });
    assert.deepEqual(first, { applied: true, micros: -3_703_704 });
    assert.equal(await balance("usr_refunds"), 6_296_296);
    assert.deepEqual(
      await credit.reverseStripeRefundOnce({
        refundId: "re_partial_a",
        paymentIntentId: "pi_refunds",
        amountMinor: 400,
        currency: "usd",
      }),
      { applied: false, micros: 0, reason: "duplicate" },
    );

    const second = await credit.reverseStripeRefundOnce({
      refundId: "re_partial_b",
      paymentIntentId: "pi_refunds",
      amountMinor: 680,
      currency: "usd",
    });
    assert.deepEqual(second, { applied: true, micros: -6_296_296 });
    assert.equal(await balance("usr_refunds"), 0);
  });

  it("caps combined refund and dispute exposure, then restores only won funds", async () => {
    await credit.creditPurchaseOnce({
      userId: "usr_disputes",
      creditsUsd: 25,
      stripeSessionId: "cs_dispute",
      stripePaymentIntentId: "pi_dispute",
      stripeAmountMinor: 2638,
      stripeCurrency: "usd",
    });
    await credit.holdStripeDisputeOnce({
      disputeId: "dp_one",
      paymentIntentId: "pi_dispute",
      amountMinor: 2638,
      currency: "usd",
    });
    assert.equal(await balance("usr_disputes"), 0);

    const refund = await credit.reverseStripeRefundOnce({
      refundId: "re_during_dispute",
      paymentIntentId: "pi_dispute",
      amountMinor: 1000,
      currency: "usd",
    });
    assert.deepEqual(refund, { applied: true, micros: 0 });
    assert.equal(await balance("usr_disputes"), 0);

    const release = await credit.releaseStripeDisputeOnce({
      disputeId: "dp_one",
      paymentIntentId: "pi_dispute",
      amountMinor: 2638,
      currency: "usd",
    });
    assert.deepEqual(release, { applied: true, micros: 15_523_124 });
    assert.equal(await balance("usr_disputes"), 15_523_124);
  });

  it("keeps refunded credits as debt when they were already consumed", async () => {
    await credit.creditPurchaseOnce({
      userId: "usr_debt",
      creditsUsd: 10,
      stripeSessionId: "cs_debt",
      stripePaymentIntentId: "pi_debt",
      stripeAmountMinor: 1080,
      stripeCurrency: "usd",
    });
    await database.db
      .update(database.schema.users)
      .set({ creditMicros: 1_000_000 })
      .where(eq(database.schema.users.id, "usr_debt"));

    await credit.reverseStripeRefundOnce({
      refundId: "re_debt",
      paymentIntentId: "pi_debt",
      amountMinor: 1080,
      currency: "usd",
    });
    assert.equal(await balance("usr_debt"), -9_000_000);
  });

  it("does not touch subscription or unknown payments without a wallet purchase", async () => {
    assert.deepEqual(
      await credit.reverseStripeRefundOnce({
        refundId: "re_unknown",
        paymentIntentId: "pi_subscription",
        amountMinor: 1900,
        currency: "usd",
      }),
      { applied: false, micros: 0, reason: "no_purchase" },
    );
  });
});
