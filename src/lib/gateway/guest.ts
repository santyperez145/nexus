import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { cache } from "@/lib/redis";
import type { AuthContext } from "./types";

/** Fixed synthetic user for public playground eco (never burns lab keys). */
export const GUEST_USER_ID = "usr_nexus_guest_playground";
export const GUEST_EMAIL = "guest+playground@nexus.local";

export async function ensureGuestUser() {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, GUEST_USER_ID))
    .limit(1);
  if (existing) return existing;

  try {
    await db.insert(schema.users).values({
      id: GUEST_USER_ID,
      name: "Guest Playground",
      email: GUEST_EMAIL,
      emailVerified: false,
      creditMicros: 0,
      allowTraining: true,
      zdr: false,
      logPrompts: false,
    });
  } catch {
    /* race: unique email/id */
  }

  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, GUEST_USER_ID))
    .limit(1);
  if (!row) {
    throw Object.assign(new Error("Guest playground unavailable"), { status: 503 });
  }
  return row;
}

export async function guestAuthContext(): Promise<AuthContext> {
  const user = await ensureGuestUser();
  return {
    userId: user.id,
    isManagement: false,
    creditMicros: 0,
    zdr: false,
    allowTraining: true,
    logPrompts: false,
    guest: true,
  };
}

/** IP-scoped throttle for anonymous playground (8 rpm). */
export async function assertGuestRateLimit(headers: Headers, rpm = 8) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "unknown";
  const redis = await cache();
  const key = `rl:guest:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const n = await redis.incr(key, 90);
  if (n > rpm) {
    throw Object.assign(new Error(`Guest rate limit exceeded (${rpm} rpm). Creá cuenta para más.`), {
      status: 429,
    });
  }
}
