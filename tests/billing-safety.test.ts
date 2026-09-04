import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  BYOK_FEE,
  CREDIT_PURCHASE_MIN_FEE_USD,
  creditPurchaseFeeUsd,
  stripeAutomaticTaxEnabled,
  stripeMode,
} from "../src/lib/config";
import {
  chargeAmountCents,
  checkoutIdempotencyKey,
  checkoutIntegrationId,
  validCheckoutRequestId,
} from "../src/lib/stripe";
import { usdToMicros, tokenCostUsd } from "../src/lib/money";
import { estimateReservationMicros } from "../src/lib/gateway/billing";
import {
  customerDefaultPaymentMethodId,
  ensureAutoTopupPaymentMethod,
} from "../src/lib/billing/stripe-payment-method";
import {
  quotedTopupFeesUsd,
  registeredMrrUsd,
  walletLiabilityMicros,
} from "../src/lib/admin/finance";

describe("atomic settle math", () => {
  it("never charges more than balance when clamping", () => {
    const balance = usdToMicros(0.01);
    const usd = tokenCostUsd(10_000, 10_000, { prompt: 0.00001, completion: 0.00002 });
    const need = usdToMicros(usd);
    assert.ok(need > balance);
    const wouldDebit = balance >= need ? need : 0;
    assert.equal(wouldDebit, 0);
  });

  it("byok fee stays below full list price", () => {
    const usd = 1.25;
    assert.ok(usdToMicros(usd * BYOK_FEE) < usdToMicros(usd));
  });

  it("preauthorizes the most expensive fallback with a UTF-8 token ceiling", () => {
    const input = [{ role: "user", content: "hola 🌎" }];
    const outputTokens = 64;
    const expensive = { prompt: 0.00001, completion: 0.00002 };
    const inputCeiling = new TextEncoder().encode(JSON.stringify(input)).byteLength;
    const reserve = estimateReservationMicros({
      input,
      estimatedInputTokens: 1,
      outputTokens,
      pricings: [{ prompt: 0.000001, completion: 0.000002 }, expensive],
    });
    assert.equal(
      reserve,
      usdToMicros(tokenCostUsd(inputCeiling, outputTokens, expensive)),
    );
  });
});

describe("stripe session idempotency shape", () => {
  it("accepts bounded opaque request ids and rejects malformed input", () => {
    assert.equal(validCheckoutRequestId("f447328f-4068-4ee1-985b-f7ad57b820f2"), true);
    assert.equal(validCheckoutRequestId("too-short"), false);
    assert.equal(validCheckoutRequestId("invalid request id with spaces"), false);
    assert.equal(validCheckoutRequestId("x".repeat(129)), false);
  });

  it("deduplicates an exact checkout attempt but isolates users and flows", () => {
    const attempt = {
      userId: "usr_customer_a",
      flow: "credits:starter",
      requestId: "f447328f-4068-4ee1-985b-f7ad57b820f2",
    };
    const key = checkoutIdempotencyKey(attempt);
    assert.equal(checkoutIdempotencyKey(attempt), key);
    assert.match(key, /^nexus:checkout:[a-f0-9]{64}$/);
    assert.notEqual(
      checkoutIdempotencyKey({ ...attempt, userId: "usr_customer_b" }),
      key,
    );
    assert.notEqual(
      checkoutIdempotencyKey({ ...attempt, flow: "subscription:pro:1" }),
      key,
    );
  });

  it("keeps the partner integration identifier stable across retries", () => {
    const requestId = "f447328f-4068-4ee1-985b-f7ad57b820f2";
    const first = checkoutIntegrationId("credits", requestId);
    assert.equal(checkoutIntegrationId("credits", requestId), first);
    assert.match(first, /^nexus_credits_[a-z]{8}$/);
    assert.notEqual(
      checkoutIntegrationId("credits", "c76b4da2-82db-4e83-b451-40bd2963b2bd"),
      first,
    );
  });

  it("treats duplicate session ids as no-ops conceptually", () => {
    const seen = new Set<string>();
    function once(sessionId: string) {
      if (seen.has(sessionId)) return false;
      seen.add(sessionId);
      return true;
    }
    assert.equal(once("cs_test_1"), true);
    assert.equal(once("cs_test_1"), false);
    assert.equal(once("cs_test_2"), true);
  });
});

describe("wallet purchase economics", () => {
  it("applies the fixed fee floor to small top-ups", () => {
    assert.equal(creditPurchaseFeeUsd(10), CREDIT_PURCHASE_MIN_FEE_USD);
    assert.equal(chargeAmountCents(10), 1080);
  });

  it("applies 5 percent once it exceeds the floor", () => {
    assert.equal(creditPurchaseFeeUsd(100), 5);
    assert.equal(chargeAmountCents(100), 10_500);
  });

  it("does not quote invalid or negative credit amounts", () => {
    assert.equal(creditPurchaseFeeUsd(0), 0);
    assert.equal(creditPurchaseFeeUsd(-10), 0);
    assert.equal(creditPurchaseFeeUsd(Number.NaN), 0);
  });
});

describe("Stripe Tax launch safety", () => {
  it("stays disabled until the deployment explicitly confirms tax readiness", () => {
    const previous = process.env.STRIPE_AUTOMATIC_TAX_ENABLED;
    delete process.env.STRIPE_AUTOMATIC_TAX_ENABLED;
    assert.equal(stripeAutomaticTaxEnabled(), false);
    process.env.STRIPE_AUTOMATIC_TAX_ENABLED = "false";
    assert.equal(stripeAutomaticTaxEnabled(), false);
    process.env.STRIPE_AUTOMATIC_TAX_ENABLED = "true";
    assert.equal(stripeAutomaticTaxEnabled(), true);
    if (previous == null) delete process.env.STRIPE_AUTOMATIC_TAX_ENABLED;
    else process.env.STRIPE_AUTOMATIC_TAX_ENABLED = previous;
  });
});

describe("Stripe environment disclosure", () => {
  it("distinguishes test, live and unknown credentials without exposing them", () => {
    const previous = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(stripeMode(), "unconfigured");
    process.env.STRIPE_SECRET_KEY = "sk_test_redacted";
    assert.equal(stripeMode(), "test");
    process.env.STRIPE_SECRET_KEY = "rk_live_redacted";
    assert.equal(stripeMode(), "live");
    process.env.STRIPE_SECRET_KEY = "opaque_secret";
    assert.equal(stripeMode(), "unknown");
    if (previous == null) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous;
  });
});

describe("Stripe auto top-up payment method", () => {
  it("keeps an existing explicit customer default", async () => {
    let paymentIntentReads = 0;
    const stripe = {
      customers: {
        retrieve: async () => ({
          id: "cus_existing",
          deleted: false,
          invoice_settings: { default_payment_method: "pm_existing" },
        }),
      },
      paymentIntents: {
        retrieve: async () => {
          paymentIntentReads += 1;
          return {};
        },
      },
    } as unknown as Stripe;
    const method = await ensureAutoTopupPaymentMethod(stripe, {
      mode: "payment",
      payment_status: "paid",
      customer: "cus_existing",
      payment_intent: "pi_existing",
    } as Stripe.Checkout.Session);
    assert.equal(method, "pm_existing");
    assert.equal(paymentIntentReads, 0);
  });

  it("sets an attached card as default after the first paid wallet checkout", async () => {
    let update: unknown;
    const stripe = {
      customers: {
        retrieve: async () => ({
          id: "cus_new",
          deleted: false,
          invoice_settings: { default_payment_method: null },
        }),
        update: async (_customerId: string, input: unknown) => {
          update = input;
          return {};
        },
      },
      paymentIntents: { retrieve: async () => ({ payment_method: "pm_new" }) },
      paymentMethods: {
        retrieve: async () => ({ id: "pm_new", type: "card", customer: "cus_new" }),
      },
    } as unknown as Stripe;
    const method = await ensureAutoTopupPaymentMethod(stripe, {
      mode: "payment",
      payment_status: "paid",
      customer: "cus_new",
      payment_intent: "pi_new",
    } as Stripe.Checkout.Session);
    assert.equal(method, "pm_new");
    assert.deepEqual(update, { invoice_settings: { default_payment_method: "pm_new" } });
  });

  it("rejects a detached or non-card payment method", async () => {
    let updates = 0;
    const stripe = {
      customers: {
        retrieve: async () => ({
          id: "cus_safe",
          deleted: false,
          invoice_settings: { default_payment_method: null },
        }),
        update: async () => {
          updates += 1;
          return {};
        },
      },
      paymentIntents: { retrieve: async () => ({ payment_method: "pm_bank" }) },
      paymentMethods: {
        retrieve: async () => ({ id: "pm_bank", type: "us_bank_account", customer: "cus_safe" }),
      },
    } as unknown as Stripe;
    const method = await ensureAutoTopupPaymentMethod(stripe, {
      mode: "payment",
      payment_status: "paid",
      customer: "cus_safe",
      payment_intent: "pi_safe",
    } as Stripe.Checkout.Session);
    assert.equal(method, null);
    assert.equal(updates, 0);
  });

  it("extracts a populated default payment method object", () => {
    assert.equal(
      customerDefaultPaymentMethodId({
        deleted: false,
        invoice_settings: { default_payment_method: { id: "pm_object" } },
      } as unknown as Stripe.Customer),
      "pm_object",
    );
  });
});

describe("finance reporting math", () => {
  it("excludes trials from registered MRR and applies paid seat quantities", () => {
    assert.equal(
      registeredMrrUsd([
        { plan: "pro", status: "active", quantity: 2 },
        { plan: "team", status: "trialing", quantity: 10 },
        { plan: "team", status: "active", quantity: 3 },
      ]),
      185,
    );
  });

  it("reports quoted top-up fees before processor costs", () => {
    assert.equal(
      quotedTopupFeesUsd([
        { micros: 10_000_000, count: 2 },
        { micros: 100_000_000, count: 1 },
      ]),
      6.6,
    );
  });

  it("keeps open reservations inside wallet liabilities", () => {
    assert.equal(walletLiabilityMicros(25_000_000, 4_000_000), 29_000_000);
  });
});
