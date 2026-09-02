import { cache } from "@/lib/redis";
import type { AuthContext } from "./types";

export async function assertRateLimit(auth: AuthContext, rpm = 60) {
  const redis = await cache();
  const key = `rl:${auth.apiKeyId ?? auth.userId}:${Math.floor(Date.now() / 60000)}`;
  const n = await redis.incr(key, 90);
  if (n > rpm) {
    throw Object.assign(new Error(`Rate limit exceeded (${rpm} rpm)`), { status: 429 });
  }
}
