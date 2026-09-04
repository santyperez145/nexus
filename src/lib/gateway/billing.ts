import { and, eq, gte, sql } from "drizzle-orm";
import {
  BYOK_FEE,
  FREE_MODEL_CREDITS_THRESHOLD_USD,
  FREE_MODEL_RPD_NO_CREDITS,
  FREE_MODEL_RPD_WITH_CREDITS,
  manualCreditsEnabled,
} from "@/lib/config";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { id } from "@/lib/ids";
import { microsToUsd, tokenCostUsd, usdToMicros } from "@/lib/money";
import { maybeNotifyKeyLimit, maybeNotifyLowBalance } from "@/lib/notify";
import { chargeAmountCents, getStripe } from "@/lib/stripe";
import { creditPurchaseOnce } from "@/lib/billing/stripe-credit";
import { defaultAutoTopupPaymentMethodId } from "@/lib/billing/stripe-payment-method";
import type { AuthContext } from "./types";

export function billingUserId(auth: AuthContext) {
  return auth.billingUserId ?? auth.userId;
}

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

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []);
}

export function estimateReservationMicros(opts: {
  input: unknown;
  estimatedInputTokens: number;
  outputTokens: number;
  pricings: Array<{ prompt: number; completion: number }>;
  isFree?: boolean;
}) {
  if (opts.isFree || !opts.pricings.length) return 0;
  const inputTokenCeiling = Math.max(
    opts.estimatedInputTokens,
    new TextEncoder().encode(JSON.stringify(opts.input)).byteLength,
  );
  return Math.max(
    0,
    ...opts.pricings.map((pricing) =>
      usdToMicros(tokenCostUsd(inputTokenCeiling, opts.outputTokens, pricing)),
    ),
  );
}

async function debitIfEnough(tx: DbExecutor, userId: string, micros: number) {
  if (micros <= 0) return;
  const result = await tx.execute(
    sql`UPDATE "user" SET credit_micros = credit_micros - ${micros} WHERE id = ${userId} AND credit_micros >= ${micros} RETURNING credit_micros`,
  );
  const rows = rowsOf(result);
  if (!rows.length) {
    throw Object.assign(new Error("Insufficient credits"), { status: 402, code: "insufficient_credits" });
  }
}

async function creditBalance(tx: DbExecutor, userId: string, micros: number) {
  if (micros <= 0) return;
  await tx
    .update(schema.users)
    .set({ creditMicros: sql`${schema.users.creditMicros} + ${micros}` })
    .where(eq(schema.users.id, userId));
}

export type CreditReservation = {
  generationId: string;
  reservedMicros: number;
};

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
  const payerId = billingUserId(auth);
  const [row] = await db
    .select({ creditMicros: schema.users.creditMicros })
    .from(schema.users)
    .where(eq(schema.users.id, payerId))
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
  generationId: string,
  estimatedMicros: number,
  opts: { isFree?: boolean; byokFeeOnly?: boolean } = {},
): Promise<CreditReservation> {
  if (auth.guest || opts.isFree) return { generationId, reservedMicros: 0 };
  const need = opts.byokFeeOnly
    ? Math.max(1, Math.floor(estimatedMicros * BYOK_FEE))
    : estimatedMicros;
  if (need <= 0) return { generationId, reservedMicros: 0 };
  const payerId = billingUserId(auth);

  await withTransaction(async (tx) => {
    await debitIfEnough(tx, payerId, need);

    let keyLimitHeld = false;
    if (auth.apiKeyId) {
      const [key] = await tx
        .select({
          limitMicros: schema.apiKeys.limitMicros,
          includeByokInLimit: schema.apiKeys.includeByokInLimit,
        })
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, auth.apiKeyId), eq(schema.apiKeys.userId, auth.userId)))
        .limit(1);
      const shouldHold = key?.limitMicros != null && (!opts.byokFeeOnly || key.includeByokInLimit);
      if (shouldHold) {
        const result = await tx.execute(
          sql`UPDATE "api_key"
              SET usage_micros = usage_micros + ${need}
              WHERE id = ${auth.apiKeyId}
                AND user_id = ${auth.userId}
                AND usage_micros + ${need} <= limit_micros
              RETURNING id`,
        );
        if (!rowsOf(result).length) {
          throw Object.assign(new Error("API key credit limit reached"), {
            status: 402,
            code: "insufficient_credits",
          });
        }
        keyLimitHeld = true;
      }
    }

    let budgetHeld = false;
    if (auth.workspaceId) {
      const [workspace] = await tx
        .select({
          id: schema.workspaces.id,
          userId: schema.workspaces.userId,
          includeByokInBudgets: schema.workspaces.includeByokInBudgets,
        })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, auth.workspaceId))
        .limit(1);
      const accessible =
        workspace &&
        (workspace.userId === auth.userId || auth.workspaceIds?.includes(workspace.id));
      if (!accessible) {
        throw Object.assign(new Error("Workspace not found"), { status: 403, code: "forbidden" });
      }
      const shouldHold = !opts.byokFeeOnly || workspace.includeByokInBudgets;
      if (shouldHold) {
        const [budget] = await tx
          .select({ id: schema.workspaceBudgets.id })
          .from(schema.workspaceBudgets)
          .where(eq(schema.workspaceBudgets.workspaceId, auth.workspaceId))
          .limit(1);
        if (budget) {
          const result = await tx.execute(
            sql`UPDATE "workspace_budget"
                SET spent_micros = spent_micros + ${need}
                WHERE id = ${budget.id}
                  AND spent_micros + ${need} <= limit_micros
                RETURNING id`,
          );
          if (!rowsOf(result).length) {
            throw Object.assign(new Error("Workspace budget exceeded"), {
              status: 402,
              code: "insufficient_credits",
            });
          }
          budgetHeld = true;
        }
      }
    }

    await tx.insert(schema.creditHolds).values({
      id: id("hold"),
      generationId,
      userId: payerId,
      apiKeyId: auth.apiKeyId,
      workspaceId: auth.workspaceId,
      reservedMicros: need,
      budgetHeld,
      keyLimitHeld,
    });
    await tx.insert(schema.creditLedger).values({
      id: id("led"),
      userId: payerId,
      type: "reserve",
      micros: -need,
      generationId,
      note: `hold ${need} µUSD`,
    });
  });

  auth.creditMicros = Math.max(0, auth.creditMicros - need);
  return { generationId, reservedMicros: need };
}

export async function releaseReserve(auth: AuthContext, reservation: CreditReservation) {
  if (auth.guest || reservation.reservedMicros <= 0) return;
  const payerId = billingUserId(auth);
  const released = await withTransaction(async (tx) => {
    const rows = await tx
      .update(schema.creditHolds)
      .set({ status: "released", closedAt: new Date(), actualMicros: 0 })
      .where(
        and(
          eq(schema.creditHolds.generationId, reservation.generationId),
          eq(schema.creditHolds.userId, payerId),
          eq(schema.creditHolds.status, "open"),
        ),
      )
      .returning();
    const hold = rows[0];
    if (!hold) return 0;
    await creditBalance(tx, payerId, hold.reservedMicros);
    if (hold.keyLimitHeld && hold.apiKeyId) {
      await tx.execute(
        sql`UPDATE "api_key" SET usage_micros = GREATEST(0, usage_micros - ${hold.reservedMicros}) WHERE id = ${hold.apiKeyId}`,
      );
    }
    if (hold.budgetHeld && hold.workspaceId) {
      await tx.execute(
        sql`UPDATE "workspace_budget" SET spent_micros = GREATEST(0, spent_micros - ${hold.reservedMicros}) WHERE workspace_id = ${hold.workspaceId}`,
      );
    }
    await tx.insert(schema.creditLedger).values({
      id: id("led"),
      userId: payerId,
      type: "reserve_release",
      micros: hold.reservedMicros,
      generationId: reservation.generationId,
      note: "hold released",
    });
    return hold.reservedMicros;
  });
  auth.creditMicros += released;
}

export async function settleUsage(opts: {
  auth: AuthContext;
  generationId: string;
  promptTokens: number;
  completionTokens: number;
  pricing: { prompt: number; completion: number };
  isFree: boolean;
  isByok: boolean;
  reservation?: CreditReservation;
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
  const reservation = opts.reservation;
  const reserved = reservation?.reservedMicros ?? 0;
  const payerId = billingUserId(opts.auth);

  const billedMicros = await withTransaction(async (tx) => {
    if (reserved > 0 && reservation) {
      const closed = await tx
        .update(schema.creditHolds)
        .set({ status: "settled", actualMicros: micros, closedAt: new Date() })
        .where(
          and(
            eq(schema.creditHolds.generationId, reservation.generationId),
            eq(schema.creditHolds.userId, payerId),
            eq(schema.creditHolds.status, "open"),
          ),
        )
        .returning();
      const hold = closed[0];
      if (!hold) {
        const [existing] = await tx
          .select({ status: schema.creditHolds.status, actualMicros: schema.creditHolds.actualMicros })
          .from(schema.creditHolds)
          .where(
            and(
              eq(schema.creditHolds.generationId, reservation.generationId),
              eq(schema.creditHolds.userId, payerId),
            ),
          )
          .limit(1);
        if (existing?.status === "settled") return existing.actualMicros ?? micros;
        throw Object.assign(new Error("Credit hold is not open"), {
          status: 409,
          code: "hold_closed",
        });
      }

      const delta = micros - hold.reservedMicros;
      if (delta > 0) await debitIfEnough(tx, payerId, delta);
      else if (delta < 0) await creditBalance(tx, payerId, -delta);
      if (hold.keyLimitHeld && hold.apiKeyId && delta !== 0) {
        await tx.execute(
          sql`UPDATE "api_key" SET usage_micros = GREATEST(0, usage_micros + ${delta}) WHERE id = ${hold.apiKeyId}`,
        );
      } else if (hold.apiKeyId && !hold.keyLimitHeld && micros > 0) {
        const [key] = await tx
          .select({ limitMicros: schema.apiKeys.limitMicros, includeByokInLimit: schema.apiKeys.includeByokInLimit })
          .from(schema.apiKeys)
          .where(and(eq(schema.apiKeys.id, hold.apiKeyId), eq(schema.apiKeys.userId, opts.auth.userId)))
          .limit(1);
        if (key?.limitMicros == null && (!opts.isByok || key?.includeByokInLimit)) {
          await tx
            .update(schema.apiKeys)
            .set({ usageMicros: sql`${schema.apiKeys.usageMicros} + ${micros}` })
            .where(eq(schema.apiKeys.id, hold.apiKeyId));
        }
      }
      if (hold.budgetHeld && hold.workspaceId && delta !== 0) {
        await tx.execute(
          sql`UPDATE "workspace_budget" SET spent_micros = GREATEST(0, spent_micros + ${delta}) WHERE workspace_id = ${hold.workspaceId}`,
        );
      }
      await tx.insert(schema.creditLedger).values({
        id: id("led"),
        userId: payerId,
        type: "reserve_release",
        micros: hold.reservedMicros,
        generationId: opts.generationId,
        note: "hold settled",
      });
      await tx.insert(schema.creditLedger).values({
        id: id("led"),
        userId: payerId,
        type: computed.ledgerType,
        micros: -micros,
        generationId: opts.generationId,
        note: opts.isByok ? `BYOK fee ${(BYOK_FEE * 100).toFixed(0)}%` : null,
      });
      return micros;
    }

    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        id: id("led"),
        userId: payerId,
        type: computed.ledgerType,
        micros: -micros,
        generationId: opts.generationId,
        note: opts.isByok ? `BYOK fee ${(BYOK_FEE * 100).toFixed(0)}%` : null,
      })
      .onConflictDoNothing({
        target: [schema.creditLedger.generationId, schema.creditLedger.type],
      })
      .returning();
    if (!inserted.length) return micros;
    if (micros > 0) await debitIfEnough(tx, payerId, micros);
    return micros;
  });

  if (billedMicros > 0) {
    const [after] = await db
      .select({ creditMicros: schema.users.creditMicros })
      .from(schema.users)
      .where(eq(schema.users.id, payerId))
      .limit(1);
    if (after) {
      opts.auth.creditMicros = after.creditMicros;
      void maybeNotifyLowBalance(payerId, after.creditMicros);
    }
  }

  if (opts.auth.apiKeyId && billedMicros > 0) {
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
  return { usd: computed.usd, micros: billedMicros };
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
  const paymentMethodId = await defaultAutoTopupPaymentMethodId(stripe, user.stripeCustomerId);
  if (!paymentMethodId) return;
  const intent = await stripe.paymentIntents.create(
    {
      amount: chargeAmountCents(amount),
      currency: "usd",
      customer: user.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      metadata: {
        userId,
        creditsUsd: String(amount),
        auto_topup: "1",
      },
    },
    { idempotencyKey: `nexus:auto-topup:${userId}:${Math.floor(Date.now() / 300_000)}` },
  );
  if (intent.status !== "succeeded") return;
  await creditPurchaseOnce({
    userId,
    stripeSessionId: intent.id,
    creditsUsd: amount,
    customerId: user.stripeCustomerId,
    note: `Auto top-up Stripe ${amount} USD (saldo < ${threshold})`,
  });
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
