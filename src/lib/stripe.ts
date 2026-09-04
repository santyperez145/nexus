import Stripe from "stripe";
import { createHash, randomBytes } from "node:crypto";
import { creditPurchaseFeeUsd } from "./config";

const CHECKOUT_REQUEST_ID = /^[A-Za-z0-9:_-]{16,128}$/;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
}

function alphaSuffix(bytes: Uint8Array) {
  return Array.from(bytes.slice(0, 8), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");
}

export function checkoutIntegrationId(flow: string, requestId?: string) {
  const suffix = alphaSuffix(
    requestId
      ? createHash("sha256").update(requestId, "utf8").digest()
      : randomBytes(8),
  );
  return `nexus_${flow}_${suffix}`;
}

export function validCheckoutRequestId(value: unknown): value is string {
  return typeof value === "string" && CHECKOUT_REQUEST_ID.test(value);
}

export function checkoutIdempotencyKey(input: {
  userId: string;
  flow: string;
  requestId: string;
}) {
  const digest = createHash("sha256")
    .update(`${input.userId}\0${input.flow}\0${input.requestId}`, "utf8")
    .digest("hex");
  return `nexus:checkout:${digest}`;
}

export function chargeAmountCents(usd: number) {
  const withFee = usd + creditPurchaseFeeUsd(usd);
  return Math.round(withFee * 100);
}
