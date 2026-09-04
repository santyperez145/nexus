import { and, eq, sql } from "drizzle-orm";
import { creditPurchaseFeeUsd } from "@/lib/config";
import { schema, withTransaction } from "@/lib/db";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";

/** Acredita compra Stripe una sola vez por session id. Inserta ledger y luego suma saldo. */
export async function creditPurchaseOnce(opts: {
  userId: string;
  creditsUsd: number;
  stripeSessionId: string;
  ledgerType?: "purchase" | "subscription_credit";
  note?: string;
  customerId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeAmountMinor?: number | null;
  stripeCurrency?: string | null;
}): Promise<{ credited: boolean; micros: number }> {
  const hasPaymentReference = Boolean(
    opts.stripePaymentIntentId || opts.stripeAmountMinor != null || opts.stripeCurrency,
  );
  if (
    hasPaymentReference &&
    (!opts.stripePaymentIntentId ||
      !Number.isSafeInteger(opts.stripeAmountMinor) ||
      (opts.stripeAmountMinor ?? 0) <= 0 ||
      !opts.stripeCurrency?.trim())
  ) {
    throw new Error("Stripe wallet purchases require a complete PaymentIntent reference");
  }
  const micros = usdToMicros(opts.creditsUsd);
  const note =
    opts.note ??
    `Compra Stripe ${opts.creditsUsd} USD (fee ${creditPurchaseFeeUsd(opts.creditsUsd).toFixed(2)} USD en el cargo)`;
  return withTransaction(async (tx) => {
    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        id: id("led"),
        userId: opts.userId,
        type: opts.ledgerType ?? "purchase",
        micros,
        stripeSessionId: opts.stripeSessionId,
        stripePaymentIntentId: opts.stripePaymentIntentId,
        stripeAmountMinor: opts.stripeAmountMinor,
        stripeCurrency: opts.stripeCurrency?.toLowerCase(),
        note,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return { credited: false, micros: 0 };

    const updated = await tx
      .update(schema.users)
      .set({
        creditMicros: sql`${schema.users.creditMicros} + ${micros}`,
        ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
      })
      .where(eq(schema.users.id, opts.userId))
      .returning();
    if (!updated.length) throw new Error("Stripe purchase user not found");

    return { credited: true, micros };
  });
}

type ExposureAdjustment = "stripe_refund" | "stripe_dispute_hold" | "stripe_dispute_release";

export type StripeCreditAdjustmentResult = {
  applied: boolean;
  micros: number;
  reason?: "duplicate" | "no_purchase" | "missing_charge_amount";
};

export function proportionalCreditMicros(
  originalMicros: number,
  exposedAmountMinor: number,
  chargedAmountMinor: number,
) {
  if (
    !Number.isSafeInteger(originalMicros) ||
    !Number.isSafeInteger(exposedAmountMinor) ||
    !Number.isSafeInteger(chargedAmountMinor) ||
    originalMicros < 0 ||
    exposedAmountMinor < 0 ||
    chargedAmountMinor <= 0
  ) {
    throw new Error("Invalid Stripe exposure amounts");
  }
  const bounded = Math.min(exposedAmountMinor, chargedAmountMinor);
  return Math.min(originalMicros, Math.round((originalMicros * bounded) / chargedAmountMinor));
}

async function adjustStripeExposureOnce(opts: {
  paymentIntentId: string;
  eventKey: string;
  adjustment: ExposureAdjustment;
  amountMinor: number;
  currency: string;
  disputeId?: string;
  note: string;
}): Promise<StripeCreditAdjustmentResult> {
  if (!opts.paymentIntentId || !opts.eventKey || !Number.isSafeInteger(opts.amountMinor) || opts.amountMinor <= 0) {
    throw new Error("Invalid Stripe credit adjustment");
  }
  const currency = opts.currency.toLowerCase();
  return withTransaction(async (tx) => {
    const [purchase] = await tx
      .select({
        userId: schema.creditLedger.userId,
        micros: schema.creditLedger.micros,
        amountMinor: schema.creditLedger.stripeAmountMinor,
        currency: schema.creditLedger.stripeCurrency,
      })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.stripePaymentIntentId, opts.paymentIntentId),
          eq(schema.creditLedger.type, "purchase"),
        ),
      )
      .limit(1);
    if (!purchase) return { applied: false, micros: 0, reason: "no_purchase" };
    if (!purchase.amountMinor || purchase.amountMinor <= 0 || !purchase.currency) {
      return { applied: false, micros: 0, reason: "missing_charge_amount" };
    }
    if (purchase.currency !== currency) throw new Error("Stripe adjustment currency mismatch");

    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, purchase.userId))
      .for("update")
      .limit(1);
    if (!owner) throw new Error("Stripe purchase user not found");

    const rows = await tx
      .select({
        type: schema.creditLedger.type,
        micros: schema.creditLedger.micros,
        stripeSessionId: schema.creditLedger.stripeSessionId,
        amountMinor: schema.creditLedger.stripeAmountMinor,
      })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.stripePaymentIntentId, opts.paymentIntentId));
    if (rows.some((row) => row.stripeSessionId === opts.eventKey)) {
      return { applied: false, micros: 0, reason: "duplicate" };
    }

    let refundedMinor = 0;
    let heldMinor = 0;
    let releasedMinor = 0;
    let currentLossMicros = 0;
    for (const row of rows) {
      if (row.type === "stripe_refund") refundedMinor += row.amountMinor ?? 0;
      if (row.type === "stripe_dispute_hold") heldMinor += row.amountMinor ?? 0;
      if (row.type === "stripe_dispute_release") releasedMinor += row.amountMinor ?? 0;
      if (
        row.type === "stripe_refund" ||
        row.type === "stripe_dispute_hold" ||
        row.type === "stripe_dispute_release"
      ) {
        currentLossMicros -= row.micros;
      }
    }
    if (opts.adjustment === "stripe_refund") refundedMinor += opts.amountMinor;
    if (opts.adjustment === "stripe_dispute_hold") heldMinor += opts.amountMinor;
    if (opts.adjustment === "stripe_dispute_release") releasedMinor += opts.amountMinor;

    const activeDisputeMinor = Math.max(0, heldMinor - releasedMinor);
    const desiredLossMicros = proportionalCreditMicros(
      purchase.micros,
      refundedMinor + activeDisputeMinor,
      purchase.amountMinor,
    );
    const rawLedgerDelta = currentLossMicros - desiredLossMicros;
    const ledgerDelta =
      opts.adjustment === "stripe_dispute_release"
        ? Math.max(0, rawLedgerDelta)
        : Math.min(0, rawLedgerDelta);

    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        id: id("led"),
        userId: purchase.userId,
        type: opts.adjustment,
        micros: ledgerDelta,
        stripeSessionId: opts.eventKey,
        stripePaymentIntentId: opts.paymentIntentId,
        stripeAmountMinor: opts.amountMinor,
        stripeCurrency: currency,
        generationId: opts.disputeId ?? null,
        note: opts.note,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) return { applied: false, micros: 0, reason: "duplicate" };

    await tx
      .update(schema.users)
      .set({ creditMicros: sql`${schema.users.creditMicros} + ${ledgerDelta}` })
      .where(eq(schema.users.id, purchase.userId));
    return { applied: true, micros: ledgerDelta };
  });
}

export function reverseStripeRefundOnce(opts: {
  refundId: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
}) {
  return adjustStripeExposureOnce({
    paymentIntentId: opts.paymentIntentId,
    eventKey: opts.refundId,
    adjustment: "stripe_refund",
    amountMinor: opts.amountMinor,
    currency: opts.currency,
    note: `Reembolso Stripe ${opts.refundId}`,
  });
}

export function holdStripeDisputeOnce(opts: {
  disputeId: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
}) {
  return adjustStripeExposureOnce({
    paymentIntentId: opts.paymentIntentId,
    eventKey: `dispute_hold:${opts.disputeId}`,
    adjustment: "stripe_dispute_hold",
    amountMinor: opts.amountMinor,
    currency: opts.currency,
    disputeId: opts.disputeId,
    note: `Retención por disputa Stripe ${opts.disputeId}`,
  });
}

export function releaseStripeDisputeOnce(opts: {
  disputeId: string;
  paymentIntentId: string;
  amountMinor: number;
  currency: string;
}) {
  return adjustStripeExposureOnce({
    paymentIntentId: opts.paymentIntentId,
    eventKey: `dispute_release:${opts.disputeId}`,
    adjustment: "stripe_dispute_release",
    amountMinor: opts.amountMinor,
    currency: opts.currency,
    disputeId: opts.disputeId,
    note: `Liberación de disputa Stripe ${opts.disputeId}`,
  });
}
