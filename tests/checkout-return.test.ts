import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import {
  checkoutSessionBelongsToUser,
  validCheckoutSessionId,
  walletCheckoutPaymentMatches,
} from "../src/lib/billing/checkout-return";

describe("wallet checkout return", () => {
  it("accepts only bounded Stripe Checkout Session ids", () => {
    assert.equal(validCheckoutSessionId("cs_test_abcdefgh12345678"), true);
    assert.equal(validCheckoutSessionId("cs_live_abcdefgh12345678"), true);
    assert.equal(validCheckoutSessionId("pi_test_abcdefgh"), false);
    assert.equal(validCheckoutSessionId("cs_test_bad/value"), false);
    assert.equal(validCheckoutSessionId(`cs_test_${"a".repeat(300)}`), false);
  });

  it("requires both server-bound ownership references", () => {
    const checkout = {
      client_reference_id: "user_owner",
      metadata: { userId: "user_owner" },
    } as unknown as Stripe.Checkout.Session;
    assert.equal(checkoutSessionBelongsToUser(checkout, "user_owner"), true);
    assert.equal(checkoutSessionBelongsToUser(checkout, "user_other"), false);
    assert.equal(
      checkoutSessionBelongsToUser(
        { ...checkout, metadata: { userId: "user_other" } },
        "user_owner",
      ),
      false,
    );
  });

  it("binds credited value to the undiscounted canonical Stripe payment", () => {
    const checkout = {
      client_reference_id: "user_owner",
      metadata: { userId: "user_owner", creditsUsd: "10" },
      currency: "usd",
      amount_subtotal: 1080,
      amount_total: 1080,
      total_details: { amount_discount: 0 },
    } as unknown as Stripe.Checkout.Session;
    const intent = {
      status: "succeeded",
      amount_received: 1080,
      currency: "usd",
      metadata: { userId: "user_owner", creditsUsd: "10" },
    } as unknown as Stripe.PaymentIntent;

    assert.equal(
      walletCheckoutPaymentMatches(checkout, intent, "user_owner", 10),
      true,
    );
    assert.equal(
      walletCheckoutPaymentMatches(
        {
          ...checkout,
          total_details: {
            amount_discount: 80,
            amount_shipping: 0,
            amount_tax: 0,
          },
        },
        { ...intent, amount_received: 1000 },
        "user_owner",
        10,
      ),
      false,
    );
    assert.equal(
      walletCheckoutPaymentMatches(
        checkout,
        { ...intent, currency: "ars" },
        "user_owner",
        10,
      ),
      false,
    );
  });
});
