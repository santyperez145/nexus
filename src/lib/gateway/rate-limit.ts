import { cache } from "@/lib/redis";
import type { AuthContext } from "./types";
import { limitsForPlan } from "@/lib/config";
import { clientIpKey } from "@/lib/network/client-ip";

export async function assertRateLimit(auth: AuthContext, rpm?: number) {
  const limit = rpm ?? limitsForPlan(auth.plan).rpm;
  const redis = await cache();
  const key = `rl:${auth.apiKeyId ?? auth.userId}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis.incr(key, 90);
  if (n > limit) {
    throw Object.assign(new Error(`Rate limit exceeded (${limit} rpm)`), { status: 429 });
  }
}

/** IP-scoped throttle for unauthenticated read endpoints that hit the control-plane database. */
export async function assertAnonymousReadRateLimit(headers: Headers, bucket: string, rpm = 60) {
  const redis = await cache();
  const key = `rl:anon:${bucket}:${clientIpKey(headers)}:${Math.floor(Date.now() / 60_000)}`;
  const count = await redis.incr(key, 90);
  if (count > rpm) {
    throw Object.assign(new Error(`Rate limit exceeded (${rpm} rpm). Autenticá para más.`), {
      status: 429,
      code: "rate_limited",
    });
  }
}

export async function assertControlPlaneRateLimit(auth: AuthContext) {
  const base = limitsForPlan(auth.plan).rpm;
  const limit = Math.max(120, Math.min(3_600, base * 2));
  const redis = await cache();
  const key = `rl:control:${auth.apiKeyId ?? auth.userId}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(key, 90);
  if (count > limit) {
    throw Object.assign(new Error(`Control-plane rate limit exceeded (${limit} rpm)`), {
      status: 429,
      code: "rate_limited",
    });
  }
}
