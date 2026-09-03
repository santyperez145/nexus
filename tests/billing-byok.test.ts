import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BYOK_FEE } from "../src/lib/config";
import { usdToMicros, tokenCostUsd } from "../src/lib/money";

describe("byok fee math", () => {
  it("charges 5% of list price in micros", () => {
    const usd = tokenCostUsd(1000, 500, { prompt: 0.000001, completion: 0.000002 });
    const feeMicros = usdToMicros(usd * BYOK_FEE);
    assert.equal(BYOK_FEE, 0.05);
    assert.ok(feeMicros > 0);
    assert.ok(feeMicros < usdToMicros(usd));
  });
});
