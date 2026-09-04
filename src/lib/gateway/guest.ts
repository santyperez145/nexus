import { cache } from "@/lib/redis";
import { sha256 } from "@/lib/crypto";
import { clientIpKey } from "@/lib/network/client-ip";
import type { AuthContext } from "./types";

/** Ephemeral playground identity — never persisted, never shared across IPs. */
export const GUEST_USER_ID = "usr_nexus_guest_playground";
export const GUEST_EMAIL = "guest+playground@nexus.local";

export function guestAuthContext(headers = new Headers()): AuthContext {
  const identity = sha256(clientIpKey(headers)).slice(0, 24);
  return {
    userId: `${GUEST_USER_ID}_${identity}`,
    isManagement: false,
    scopes: ["inference:write"],
    plan: "guest",
    creditMicros: 0,
    zdr: false,
    allowTraining: false,
    logPrompts: false,
    guest: true,
  };
}

/** IP-scoped throttle for anonymous playground (8 rpm). */
export async function assertGuestRateLimit(headers: Headers, rpm = 8) {
  const ip = clientIpKey(headers);
  const redis = await cache();
  const key = `rl:guest:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const n = await redis.incr(key, 90);
  if (n > rpm) {
    throw Object.assign(new Error(`Guest rate limit exceeded (${rpm} rpm). Creá cuenta para más.`), {
      status: 429,
      code: "rate_limited",
    });
  }
}
