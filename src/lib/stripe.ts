import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { creditPurchaseFeeUsd } from "./config";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
}

export function checkoutIntegrationId(flow: string) {
  const suffix = randomBytes(6)
    .toString("base64url")
    .replace(/[^a-z]/gi, "a")
    .slice(0, 8)
    .padEnd(8, "a");
  return `nexus_${flow}_${suffix}`;
}

export function chargeAmountCents(usd: number) {
  const withFee = usd + creditPurchaseFeeUsd(usd);
  return Math.round(withFee * 100);
}
