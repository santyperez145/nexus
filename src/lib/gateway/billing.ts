import { and, eq, gte, sql } from "drizzle-orm";
import { BYOK_FEE, FREE_MODEL_CREDITS_THRESHOLD_USD, FREE_MODEL_RPD_NO_CREDITS, FREE_MODEL_RPD_WITH_CREDITS } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { microsToUsd, tokenCostUsd, usdToMicros } from "@/lib/money";
import { chargeAmountCents, getStripe } from "@/lib/stripe";
import type { AuthContext } from "./types";

export async function assertCredits(
  auth: AuthContext,
  estimatedMicros: number,
  opts: { isFree?: boolean; byokFeeOnly?: boolean } = {},
) {
  if (opts.isFree) return;
  const need = opts.byokFeeOnly
    ? Math.max(1, Math.floor(estimatedMicros * BYOK_FEE))
    : estimatedMicros;
  if (auth.creditMicros < need) {
    const err = new Error("Insufficient credits");
    (err as Error & { status: number }).status = 402;
    throw err;
  }
  if (auth.workspaceId) {
    const [budget] = await db
      .select()
      .from(schema.workspaceBudgets)
      .where(eq(schema.workspaceBudgets.workspaceId, auth.workspaceId))
      .limit(1);
    if (budget && budget.spentMicros + need > budget.limitMicros) {
      throw Object.assign(new Error("Workspace budget exceeded"), { status: 402 });
    }
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
  let ledgerType = "inference";
  if (opts.isFree) micros = 0;
  else if (opts.isByok) {
    micros = usdToMicros(usd * BYOK_FEE);
    ledgerType = "byok_fee";
  }
  if (opts.auth.logPrompts && micros > 0) micros = Math.floor(micros * 0.99);

  if (micros > 0) {
    const [row] = await db
      .select({ creditMicros: schema.users.creditMicros })
      .from(schema.users)
      .where(eq(schema.users.id, opts.auth.userId))
      .limit(1);
    if (!row || row.creditMicros < micros) {
      throw Object.assign(new Error("Insufficient credits"), { status: 402 });
    }
    const debited = await db
      .update(schema.users)
      .set({ creditMicros: row.creditMicros - micros })
      .where(
        and(eq(schema.users.id, opts.auth.userId), eq(schema.users.creditMicros, row.creditMicros)),
      );
    // Si otra request ganó la carrera, creditMicros ya no coincide
    void debited;
    const [after] = await db
      .select({ creditMicros: schema.users.creditMicros })
      .from(schema.users)
      .where(eq(schema.users.id, opts.auth.userId))
      .limit(1);
    if (!after || after.creditMicros !== row.creditMicros - micros) {
      throw Object.assign(new Error("Insufficient credits"), { status: 402 });
    }
    await db.insert(schema.creditLedger).values({
      id: id("led"),
      userId: opts.auth.userId,
      type: ledgerType,
      micros: -micros,
      generationId: opts.generationId,
      note: opts.isByok ? `BYOK fee ${(BYOK_FEE * 100).toFixed(0)}%` : null,
    });
  }
  if (opts.auth.apiKeyId) {
    await db
      .update(schema.apiKeys)
      .set({
        usageMicros: sql`${schema.apiKeys.usageMicros} + ${micros}`,
        lastUsedAt: new Date(),
      })
      .where(eq(schema.apiKeys.id, opts.auth.apiKeyId));
  }
  if (opts.auth.workspaceId && micros > 0) {
    await db
      .update(schema.workspaceBudgets)
      .set({ spentMicros: sql`${schema.workspaceBudgets.spentMicros} + ${micros}` })
      .where(eq(schema.workspaceBudgets.workspaceId, opts.auth.workspaceId));
  }
  return { usd: opts.isByok ? usd * BYOK_FEE : usd, micros };
}

export async function maybeAutoTopup(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.autoTopupEnabled) return;
  const threshold = Number(user.autoTopupThresholdUsd ?? 0);
  const amount = Number(user.autoTopupAmountUsd ?? 0);
  if (!(threshold > 0) || !(amount > 0)) return;
  if (microsToUsd(user.creditMicros) >= threshold) return;

  const manualOk = process.env.ENABLE_MANUAL_CREDITS !== "false";
  if (manualOk) {
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
      note: `Auto top-up ${amount} USD (wallet manual, saldo < ${threshold})`,
    });
    return;
  }

  const stripe = getStripe();
  if (!stripe || !user.stripeCustomerId) return;
  const methods = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: "card",
    limit: 1,
  });
  const pm = methods.data[0];
  if (!pm) return;
  const intent = await stripe.paymentIntents.create({
    amount: chargeAmountCents(amount),
    currency: "usd",
    customer: user.stripeCustomerId,
    payment_method: pm.id,
    off_session: true,
    confirm: true,
    metadata: {
      userId,
      creditsUsd: String(amount),
      auto_topup: "1",
    },
  });
  if (intent.status !== "succeeded") return;
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
    note: `Auto top-up Stripe ${amount} USD (saldo < ${threshold}) · pi ${intent.id}`,
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
