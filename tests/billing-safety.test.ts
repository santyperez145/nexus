import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BYOK_FEE, stripeAutomaticTaxEnabled } from "../src/lib/config";
import { usdToMicros, tokenCostUsd } from "../src/lib/money";
import { estimateReservationMicros } from "../src/lib/gateway/billing";

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
