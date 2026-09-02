import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { tokenCostUsd, usdToMicros } from "@/lib/money";
import {
  FREE_MODEL_CREDITS_THRESHOLD_USD,
  FREE_MODEL_RPD_NO_CREDITS,
  FREE_MODEL_RPD_WITH_CREDITS,
} from "@/lib/config";
import { microsToUsd } from "@/lib/money";
import type { AuthContext } from "./types";

export async function assertCredits(auth: AuthContext, estimatedMicros: number, isFree: boolean) {
  if (isFree) return;
  if (auth.creditMicros < estimatedMicros) {
    const err = new Error("Insufficient credits");
    (err as Error & { status: number }).status = 402;
    throw err;
  }
}

export async function settleUsage(opts: {
  auth: AuthContext;
  generationId: string;
  promptTokens: number;
  completionTokens: number;
  pricing: { prompt: number; completion: number };
  isFree: boolean;
  isByok: boolean;
}) {
  const usd = tokenCostUsd(opts.promptTokens, opts.completionTokens, opts.pricing);
  let micros = usdToMicros(usd);
  if (opts.isFree || opts.isByok) micros = 0;
  if (opts.auth.logPrompts) micros = Math.floor(micros * 0.99);

  if (micros > 0) {
    await db
      .update(schema.users)
      .set({ creditMicros: sql`${schema.users.creditMicros} - ${micros}` })
      .where(eq(schema.users.id, opts.auth.userId));
    await db.insert(schema.creditLedger).values({
      id: id("led"),
      userId: opts.auth.userId,
      type: "inference",
      micros: -micros,
      generationId: opts.generationId,
    });
    if (opts.auth.apiKeyId) {
      await db
        .update(schema.apiKeys)
        .set({
          usageMicros: sql`${schema.apiKeys.usageMicros} + ${micros}`,
          lastUsedAt: new Date(),
        })
        .where(eq(schema.apiKeys.id, opts.auth.apiKeyId));
    }
  }
  return { usd, micros };
}

export async function maybeAutoTopup(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.autoTopupEnabled) return;
  const threshold = Number(user.autoTopupThresholdUsd ?? 0);
  const amount = Number(user.autoTopupAmountUsd ?? 0);
  if (!(threshold > 0) || !(amount > 0)) return;
  if (microsToUsd(user.creditMicros) >= threshold) return;
  if (process.env.ENABLE_MANUAL_CREDITS === "false") return;
  const micros = usdToMicros(amount);
  await db
    .update(schema.users)
    .set({ creditMicros: sql`${schema.users.creditMicros} + ${micros}` })
    .where(eq(schema.users.id, userId));
  await db.insert(schema.creditLedger).values({
    id: id("led"),
    userId,
    type: "auto_topup",
    micros,
    note: `Auto top-up ${amount} USD (saldo < ${threshold})`,
  });
}

export async function checkFreeRateLimit(auth: AuthContext, isFree: boolean) {
  if (!isFree) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.userId, auth.userId),
        gte(schema.generations.createdAt, since),
        eq(schema.generations.costMicros, 0),
      ),
    );
  const hasCredits = microsToUsd(auth.creditMicros) >= FREE_MODEL_CREDITS_THRESHOLD_USD;
  const limit = hasCredits ? FREE_MODEL_RPD_WITH_CREDITS : FREE_MODEL_RPD_NO_CREDITS;
  if (rows.length >= limit) {
    const err = new Error(`Free model rate limit exceeded (${limit} req/day)`);
    (err as Error & { status: number }).status = 429;
    throw err;
  }
}
