import type Stripe from "stripe";
import { chargeAmountCents } from "@/lib/stripe";

export function validCheckoutSessionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 255 &&
    /^cs_(?:test|live)_[A-Za-z0-9]{8,}$/.test(value)
  );
}

export function checkoutSessionBelongsToUser(
  checkout: Pick<Stripe.Checkout.Session, "client_reference_id" | "metadata">,
  userId: string,
) {
  return (
    checkout.client_reference_id === userId &&
    checkout.metadata?.userId === userId
  );
}

export function walletCheckoutPaymentMatches(
  checkout: Pick<
    Stripe.Checkout.Session,
    | "amount_subtotal"
    | "amount_total"
    | "client_reference_id"
    | "currency"
    | "metadata"
    | "total_details"
  >,
  intent: Pick<
    Stripe.PaymentIntent,
    "amount_received" | "currency" | "metadata" | "status"
  >,
  userId: string,
  creditsUsd: number,
) {
  if (!Number.isFinite(creditsUsd) || creditsUsd <= 0) return false;
  const expectedSubtotal = chargeAmountCents(creditsUsd);
  return (
    checkoutSessionBelongsToUser(checkout, userId) &&
    checkout.currency?.toLowerCase() === "usd" &&
    checkout.amount_subtotal === expectedSubtotal &&
    (checkout.total_details?.amount_discount ?? 0) === 0 &&
    Number.isSafeInteger(checkout.amount_total) &&
    (checkout.amount_total ?? 0) >= expectedSubtotal &&
    intent.status === "succeeded" &&
    intent.currency.toLowerCase() === "usd" &&
    intent.amount_received === checkout.amount_total &&
    intent.metadata?.userId === userId &&
    Number(intent.metadata?.creditsUsd ?? 0) === creditsUsd
  );
}
