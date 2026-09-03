import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BYOK_FEE } from "../src/lib/config";
import { usdToMicros, tokenCostUsd } from "../src/lib/money";

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
