import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSubscriptionReturn } from "../src/lib/billing/subscription-return";

describe("subscription checkout return", () => {
  it("keeps polling until Stripe state is authoritative", () => {
    assert.deepEqual(resolveSubscriptionReturn("ok", "incomplete", "pro"), {
      state: "pending",
      notice: "Confirmando suscripción con Stripe…",
    });
  });

  it("shows the reconciled plan after the query string is cleared", () => {
    assert.deepEqual(resolveSubscriptionReturn("ok", "active", "pro"), {
      state: "confirmed",
      notice: "Plan Pro activo.",
    });
    assert.deepEqual(resolveSubscriptionReturn("ok", "trialing", "team"), {
      state: "confirmed",
      notice: "Plan Team activo.",
    });
  });

  it("ignores unrelated visits", () => {
    assert.deepEqual(resolveSubscriptionReturn(null, "active", "pro"), {
      state: "idle",
      notice: null,
    });
  });
});
