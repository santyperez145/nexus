import Stripe from "stripe";
import { CREDIT_PURCHASE_FEE } from "./config";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function chargeAmountCents(usd: number) {
  const withFee = usd * (1 + CREDIT_PURCHASE_FEE);
  return Math.round(withFee * 100);
}
