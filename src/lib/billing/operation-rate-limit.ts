import { cache } from "@/lib/redis";

export type BillingOperation =
  "checkout_create" | "checkout_reconcile" | "portal_create";

type Counter = {
  incr(key: string, ttlSec: number): Promise<number>;
};

type CounterFactory = () => Promise<Counter>;

const BILLING_OPERATION_LIMITS: Record<
  BillingOperation,
  { limit: number; windowSeconds: number }
> = {
  checkout_create: { limit: 10, windowSeconds: 10 * 60 },
  checkout_reconcile: { limit: 30, windowSeconds: 60 },
  portal_create: { limit: 20, windowSeconds: 10 * 60 },
};

export type BillingOperationRateLimit = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export async function consumeBillingOperationRateLimit(
  userId: string,
  operation: BillingOperation,
  options: { now?: number; counterFactory?: CounterFactory } = {},
): Promise<BillingOperationRateLimit> {
  const { limit, windowSeconds } = BILLING_OPERATION_LIMITS[operation];
  const now = options.now ?? Date.now();
  const windowMs = windowSeconds * 1_000;
  const windowId = Math.floor(now / windowMs);
  const resetAt = (windowId + 1) * windowMs;
  const counter = await (options.counterFactory ?? cache)();
  const count = await counter.incr(
    `rl:billing:${operation}:${userId}:${windowId}`,
    windowSeconds + 5,
  );

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
  };
}
