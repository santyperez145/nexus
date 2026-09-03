import { and, eq, gte, sql } from "drizzle-orm";
import {
  BYOK_FEE,
  FREE_MODEL_CREDITS_THRESHOLD_USD,
  FREE_MODEL_RPD_NO_CREDITS,
  FREE_MODEL_RPD_WITH_CREDITS,
  manualCreditsEnabled,
} from "@/lib/config";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { microsToUsd, tokenCostUsd, usdToMicros } from "@/lib/money";
import { maybeNotifyKeyLimit, maybeNotifyLowBalance } from "@/lib/notify";
import { chargeAmountCents, getStripe } from "@/lib/stripe";
import type { AuthContext } from "./types";

function computeMicros(opts: {
  promptTokens: number;
  completionTokens: number;
  pricing: { prompt: number; completion: number };
  isFree: boolean;
  isByok: boolean;
  logPrompts: boolean;
}) {
  const usd = tokenCostUsd(opts.promptTokens, opts.completionTokens, opts.pricing);
  let micros = usdToMicros(usd);
  let ledgerType = "inference";
  if (opts.isFree) micros = 0;
  else if (opts.isByok) {
    micros = usdToMicros(usd * BYOK_FEE);
    ledgerType = "byok_fee";
  }
  if (opts.logPrompts && micros > 0) micros = Math.floor(micros * 0.99);
  return { usd: opts.isByok ? usd * BYOK_FEE : usd, micros, ledgerType };
}

async function debitIfEnough(userId: string, micros: number) {
  if (micros <= 0) return;
  const result = await db.execute(
    sql`UPDATE "user" SET credit_micros = credit_micros - ${micros} WHERE id = ${userId} AND credit_micros >= ${micros} RETURNING credit_micros`,
  );
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] }).rows ?? []);
  if (!rows.length) {
    throw Object.assign(new Error("Insufficient credits"), { status: 402, code: "insufficient_credits" });
  }
}

async function creditBalance(userId: string, micros: number) {
  if (micros <= 0) return;
  await db
    .update(schema.users)
    .set({ creditMicros: sql`${schema.users.creditMicros} + ${micros}` })
    .where(eq(schema.users.id, userId));
}

export async function assertCredits(
  auth: AuthContext,
  estimatedMicros: number,
  opts: { isFree?: boolean; byokFeeOnly?: boolean } = {},
) {
  if (auth.guest) return;
  if (opts.isFree) return;
  const need = opts.byokFeeOnly
    ? Math.max(1, Math.floor(estimatedMicros * BYOK_FEE))
    : estimatedMicros;
  if (need <= 0) return;
  const [row] = await db
    .select({ creditMicros: schema.users.creditMicros })
    .from(schema.users)
    .where(eq(schema.users.id, auth.userId))
    .limit(1);
  if (!row || row.creditMicros < need) {
    throw Object.assign(new Error("Insufficient credits"), { status: 402, code: "insufficient_credits" });
  }
  auth.creditMicros = row.creditMicros;
  if (auth.workspaceId) {
    const [ws] = await db
      .select({
        includeByokInBudgets: schema.workspaces.includeByokInBudgets,
      })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, auth.workspaceId))
      .limit(1);
    const skipByokBudget = Boolean(opts.byokFeeOnly) && !ws?.includeByokInBudgets;
    if (!skipByokBudget) {
      const [budget] = await db
        .select()
        .from(schema.workspaceBudgets)
        .where(eq(schema.workspaceBudgets.workspaceId, auth.workspaceId))
        .limit(1);
      if (budget && budget.spentMicros + need > budget.limitMicros) {
        throw Object.assign(new Error("Workspace budget exceeded"), { status: 402, code: "insufficient_credits" });
      }
    }
  }
}

export async function reserveCredits(
  auth: AuthContext,
  estimatedMicros: number,
  opts: { isFree?: boolean; byokFeeOnly?: boolean } = {},
): Promise<number> {
  if (auth.guest || opts.isFree) return 0;
  const need = opts.byokFeeOnly
    ? Math.max(1, Math.floor(estimatedMicros * BYOK_FEE))
    : estimatedMicros;
  if (need <= 0) return 0;
  await assertCredits(auth, estimatedMicros, opts);
  await debitIfEnough(auth.userId, need);
  auth.creditMicros = Math.max(0, auth.creditMicros - need);
  await db.insert(schema.creditLedger).values({
    id: id("led"),
    userId: auth.userId,
    type: "reserve",
    micros: -need,
    note: `hold ${need} µUSD`,
  });
  return need;
}

export async function releaseReserve(auth: AuthContext, reservedMicros: number) {
  if (auth.guest || reservedMicros <= 0) return;
  await creditBalance(auth.userId, reservedMicros);
  auth.creditMicros += reservedMicros;
  await db.insert(schema.creditLedger).values({
    id: id("led"),
    userId: auth.userId,
    type: "reserve_release",
    micros: reservedMicros,
    note: "hold released",
  });
}

export async function settleUsage(opts: {
  auth: AuthContext;
  generationId: string;
  promptTokens: number;
  completionTokens: number;
  pricing: { prompt: number; completion: number };
  isFree: boolean;
  isByok: boolean;
  reservedMicros?: number;
}) {
  if (opts.auth.guest) return { usd: 0, micros: 0 };
  const computed = computeMicros({
    promptTokens: opts.promptTokens,
    completionTokens: opts.completionTokens,
    pricing: opts.pricing,
    isFree: opts.isFree,
    isByok: opts.isByok,
    logPrompts: opts.auth.logPrompts,
  });
  const micros = computed.micros;
  const reserved = opts.reservedMicros ?? 0;

  if (reserved > 0) {
    if (micros < reserved) await creditBalance(opts.auth.userId, reserved - micros);
    else if (micros > reserved) await debitIfEnough(opts.auth.userId, micros - reserved);
    await db.insert(schema.creditLedger).values({
      id: id("led"),
      userId: opts.auth.userId,
      type: "reserve_release",
      micros: reserved,
      generationId: opts.generationId,
      note: "hold closed",
    }).catch(() => undefined);
  } else if (micros > 0) {
    await debitIfEnough(opts.auth.userId, micros);
  }

  if (micros > 0) {
    try {
      await db.insert(schema.creditLedger).values({
        id: id("led"),
        userId: opts.auth.userId,
        type: computed.ledgerType,
        micros: -micros,
        generationId: opts.generationId,
        note: opts.isByok ? `BYOK fee ${(BYOK_FEE * 100).toFixed(0)}%` : null,
      });
    } catch {
      /* unique generation_id: already settled */
    }
    const [after] = await db
      .select({ creditMicros: schema.users.creditMicros })
      .from(schema.users)
      .where(eq(schema.users.id, opts.auth.userId))
      .limit(1);
    if (after) {
      opts.auth.creditMicros = after.creditMicros;
      void maybeNotifyLowBalance(opts.auth.userId, after.creditMicros);
    }
  }

  if (opts.auth.apiKeyId) {
    await db
      .update(schema.apiKeys)
      .set({
        usageMicros: sql`${schema.apiKeys.usageMicros} + ${micros}`,
        lastUsedAt: new Date(),
      })
      .where(eq(schema.apiKeys.id, opts.auth.apiKeyId));
    const [key] = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, opts.auth.apiKeyId))
      .limit(1);
    if (key?.limitMicros != null) {
      void maybeNotifyKeyLimit({
        userId: opts.auth.userId,
        keyName: key.name,
        usage: microsToUsd(key.usageMicros),
        limit: microsToUsd(key.limitMicros),
      });
    }
  }
  if (opts.auth.workspaceId && micros > 0) {
    let chargeBudget = true;
    if (opts.isByok) {
      const [ws] = await db
        .select({ includeByokInBudgets: schema.workspaces.includeByokInBudgets })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, opts.auth.workspaceId))
        .limit(1);
      chargeBudget = Boolean(ws?.includeByokInBudgets);
    }
    if (chargeBudget) {
      await db
        .update(schema.workspaceBudgets)
        .set({ spentMicros: sql`${schema.workspaceBudgets.spentMicros} + ${micros}` })
        .where(eq(schema.workspaceBudgets.workspaceId, opts.auth.workspaceId));
    }
  }
  return { usd: computed.usd, micros };
}

export async function maybeAutoTopup(userId: string) {
  if (manualCreditsEnabled()) return;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.autoTopupEnabled) return;
  const threshold = Number(user.autoTopupThresholdUsd ?? 0);
  const amount = Number(user.autoTopupAmountUsd ?? 0);
  if (!(threshold > 0) || !(amount > 0)) return;
  if (microsToUsd(user.creditMicros) >= threshold) return;

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
  await db.insert(schema.creditLedger).values({
    id: id("led"),
    userId,
    type: "auto_topup",
    micros,
    note: `Auto top-up Stripe ${amount} USD (saldo < ${threshold}) · pi ${intent.id}`,
    stripeSessionId: intent.id,
  });
  await db
    .update(schema.users)
    .set({ creditMicros: sql`${schema.users.creditMicros} + ${micros}` })
    .where(eq(schema.users.id, userId));
}

export async function checkFreeRateLimit(auth: AuthContext, isFree: boolean) {
  if (!isFree || auth.guest) return;
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
    throw Object.assign(new Error(`Free model rate limit exceeded (${limit} req/day)`), {
      status: 429,
      code: "rate_limited",
    });
  }
}
