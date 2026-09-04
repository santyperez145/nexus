import {
  consumeFixedWindowRateLimit,
  type FixedWindowRateLimit,
  type RateLimitCounterFactory,
} from "@/lib/operation-rate-limit";

export type BillingOperation =
  "checkout_create" | "checkout_reconcile" | "portal_create";

const BILLING_OPERATION_LIMITS: Record<
  BillingOperation,
  { limit: number; windowSeconds: number }
> = {
  checkout_create: { limit: 10, windowSeconds: 10 * 60 },
  checkout_reconcile: { limit: 30, windowSeconds: 60 },
  portal_create: { limit: 20, windowSeconds: 10 * 60 },
};

export type BillingOperationRateLimit = FixedWindowRateLimit;

export async function consumeBillingOperationRateLimit(
  userId: string,
  operation: BillingOperation,
  options: { now?: number; counterFactory?: RateLimitCounterFactory } = {},
): Promise<BillingOperationRateLimit> {
  return consumeFixedWindowRateLimit(
    userId,
    `billing:${operation}`,
    BILLING_OPERATION_LIMITS[operation],
    options,
  );
}
