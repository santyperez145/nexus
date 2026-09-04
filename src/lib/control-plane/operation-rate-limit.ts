import {
  consumeFixedWindowRateLimit,
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
  type FixedWindowRateLimit,
  type RateLimitCounterFactory,
} from "@/lib/operation-rate-limit";

export type ControlPlaneOperation =
  | "auto_topup_verify"
  | "catalog_sync"
  | "connection_probe"
  | "credit_adjustment"
  | "notification_test"
  | "stripe_event_replay";

const CONTROL_PLANE_OPERATION_LIMITS: Record<
  ControlPlaneOperation,
  { limit: number; windowSeconds: number }
> = {
  auto_topup_verify: { limit: 10, windowSeconds: 10 * 60 },
  catalog_sync: { limit: 2, windowSeconds: 10 * 60 },
  connection_probe: { limit: 6, windowSeconds: 10 * 60 },
  credit_adjustment: { limit: 30, windowSeconds: 10 * 60 },
  notification_test: { limit: 3, windowSeconds: 60 * 60 },
  stripe_event_replay: { limit: 10, windowSeconds: 10 * 60 },
};

export async function consumeControlPlaneOperationRateLimit(
  userId: string,
  operation: ControlPlaneOperation,
  options: { now?: number; counterFactory?: RateLimitCounterFactory } = {},
): Promise<FixedWindowRateLimit> {
  return consumeFixedWindowRateLimit(
    userId,
    `control:${operation}`,
    CONTROL_PLANE_OPERATION_LIMITS[operation],
    options,
  );
}

export async function enforceControlPlaneOperationRateLimit(
  userId: string,
  operation: ControlPlaneOperation,
  options: { now?: number; counterFactory?: RateLimitCounterFactory } = {},
) {
  try {
    const result = await consumeControlPlaneOperationRateLimit(
      userId,
      operation,
      options,
    );
    return result.allowed ? null : rateLimitExceededResponse(result);
  } catch (error) {
    console.error("Control-plane operation rate limit unavailable", {
      operation,
      userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return rateLimitUnavailableResponse();
  }
}
