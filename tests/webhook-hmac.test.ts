import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signWebhookBody } from "../src/lib/observability/dispatch";

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
