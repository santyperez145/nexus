import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signWebhookBody, webhookRetryDelayMs } from "../src/lib/observability/dispatch";

describe("webhook hmac", () => {
  it("signs payload deterministically", () => {
    const body = JSON.stringify({ event: "generation.completed", data: { id: "gen-1" } });
    const a = signWebhookBody("nxs_secret", body);
    const b = signWebhookBody("nxs_secret", body);
    assert.equal(a, b);
    assert.equal(a.length, 64);
    assert.notEqual(signWebhookBody("other", body), a);
  });
});

describe("webhook retry policy", () => {
  it("backs off progressively and caps at 24 hours", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(webhookRetryDelayMs), [
      60_000,
      300_000,
      1_800_000,
      7_200_000,
      21_600_000,
      86_400_000,
    ]);
    assert.equal(webhookRetryDelayMs(99), 86_400_000);
  });
});
