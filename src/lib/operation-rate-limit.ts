import { cache } from "@/lib/redis";

export type RateLimitCounter = {
  incr(key: string, ttlSec: number): Promise<number>;
};

export type RateLimitCounterFactory = () => Promise<RateLimitCounter>;

export type FixedWindowRateLimit = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export async function consumeFixedWindowRateLimit(
  identifier: string,
  namespace: string,
  rule: { limit: number; windowSeconds: number },
  options: { now?: number; counterFactory?: RateLimitCounterFactory } = {},
): Promise<FixedWindowRateLimit> {
  const now = options.now ?? Date.now();
  const windowMs = rule.windowSeconds * 1_000;
  const windowId = Math.floor(now / windowMs);
  const resetAt = (windowId + 1) * windowMs;
  const counter = await (options.counterFactory ?? cache)();
  const count = await counter.incr(
    `rl:${namespace}:${identifier}:${windowId}`,
    rule.windowSeconds + 5,
  );

  return {
    allowed: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
  };
}

export function rateLimitExceededResponse(
  result: FixedWindowRateLimit,
  message = "Demasiadas operaciones. Intentá nuevamente más tarde.",
) {
  return Response.json(
    {
      error: {
        message,
        type: "rate_limit_error",
        code: "rate_limited",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1_000)),
      },
    },
  );
}

export function rateLimitUnavailableResponse() {
  return Response.json(
    {
      error: {
        message:
          "La protección de esta operación no está disponible temporalmente.",
        type: "server_error",
        code: "rate_limit_unavailable",
      },
    },
    { status: 503 },
  );
}
