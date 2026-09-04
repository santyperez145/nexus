import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import {
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  creditPurchaseFeeUsd,
} from "@/lib/config";
import {
  creditPurchaseOnce,
  holdStripeDisputeOnce,
  releaseStripeDisputeOnce,
  reverseStripeRefundOnce,
  type StripeCreditAdjustmentResult,
} from "@/lib/billing/stripe-credit";
import { ensureAutoTopupPaymentMethod } from "@/lib/billing/stripe-payment-method";
import { walletCheckoutPaymentMatches } from "@/lib/billing/checkout-return";
import {
  invoiceGrantsIncludedCredits,
  reconcileStripeSubscription,
  reconcileStripeSubscriptionById,
  subscriptionIdFromInvoice,
} from "@/lib/billing/stripe-subscription";
import {
  claimStripeWebhookEvent,
  markStripeWebhookFailed,
  markStripeWebhookProcessed,
  type StripeWebhookClaim,
} from "@/lib/billing/stripe-webhook-event";
import { db, ensureDb, schema } from "@/lib/db";

export type StripeEventOutcome =
  Exclude<StripeWebhookClaim, "claimed"> | "processed";

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value)
    return String(value.id);
  return null;
}

export async function reconcileWalletCheckout(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return { settled: false, credited: false, creditsUsd: 0 };
  }
  const userId = session.metadata?.userId;
  const creditsUsd = Number(session.metadata?.creditsUsd ?? 0);
  if (!userId || !(creditsUsd > 0)) {
    throw new Error("Paid wallet checkout is missing valid purchase metadata");
  }
  if (!CREDIT_PACKS.some((pack) => pack.usd === creditsUsd)) {
    throw new Error("Paid wallet checkout uses an unsupported credit pack");
  }
  const paymentIntentId = objectId(session.payment_intent);
  if (!paymentIntentId)
    throw new Error("Paid wallet checkout is missing its PaymentIntent");
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (!walletCheckoutPaymentMatches(session, intent, userId, creditsUsd)) {
    throw new Error(
      "Paid wallet checkout does not match its canonical PaymentIntent",
    );
  }
  const purchase = await creditPurchaseOnce({
    userId,
    creditsUsd,
    stripeSessionId: session.id,
    stripePaymentIntentId: intent.id,
    stripeAmountMinor: intent.amount_received,
    stripeCurrency: intent.currency,
    customerId: objectId(session.customer),
    note: `Compra Stripe ${creditsUsd} USD (comisión ${creditPurchaseFeeUsd(creditsUsd).toFixed(2)} USD en el cargo)`,
  });
  await ensureAutoTopupPaymentMethod(stripe, session);
  await reconcileSucceededRefunds(stripe, intent);
  return {
    settled: true,
    credited: purchase.credited,
    creditsUsd,
  };
}

function isWalletPaymentIntent(intent: Stripe.PaymentIntent) {
  return Boolean(
    intent.metadata?.userId && Number(intent.metadata?.creditsUsd ?? 0) > 0,
  );
}

function requireWalletAdjustment(
  result: StripeCreditAdjustmentResult,
  intent: Stripe.PaymentIntent,
) {
  if (
    isWalletPaymentIntent(intent) &&
    (result.reason === "no_purchase" ||
      result.reason === "missing_charge_amount")
  ) {
    throw new Error(
      `Wallet credit adjustment cannot find canonical purchase for ${intent.id}`,
    );
  }
}

async function reverseSucceededRefund(
  stripe: Stripe,
  refund: Stripe.Refund,
  knownIntent?: Stripe.PaymentIntent,
) {
  if (refund.status !== "succeeded") return;
  const paymentIntentId = objectId(refund.payment_intent);
  if (!paymentIntentId) return;
  const intent =
    knownIntent?.id === paymentIntentId
      ? knownIntent
      : await stripe.paymentIntents.retrieve(paymentIntentId);
  const result = await reverseStripeRefundOnce({
    refundId: refund.id,
    paymentIntentId,
    amountMinor: refund.amount,
    currency: refund.currency,
  });
  requireWalletAdjustment(result, intent);
}

async function reconcileSucceededRefunds(
  stripe: Stripe,
  intent: Stripe.PaymentIntent,
) {
  for await (const refund of stripe.refunds.list({
    payment_intent: intent.id,
    limit: 100,
  })) {
    await reverseSucceededRefund(stripe, refund, intent);
  }
}

async function reconcileDispute(stripe: Stripe, snapshot: Stripe.Dispute) {
  const dispute = await stripe.disputes.retrieve(snapshot.id);
  const paymentIntentId = objectId(dispute.payment_intent);
  if (!paymentIntentId) return;
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  let result: StripeCreditAdjustmentResult | null = null;
  if (
    dispute.status === "needs_response" ||
    dispute.status === "under_review" ||
    dispute.status === "lost"
  ) {
    result = await holdStripeDisputeOnce({
      disputeId: dispute.id,
      paymentIntentId,
      amountMinor: dispute.amount,
      currency: dispute.currency,
    });
  } else if (
    dispute.status === "won" ||
    dispute.status === "warning_closed" ||
    dispute.status === "prevented"
  ) {
    result = await releaseStripeDisputeOnce({
      disputeId: dispute.id,
      paymentIntentId,
      amountMinor: dispute.amount,
      currency: dispute.currency,
    });
  }
  if (result) requireWalletAdjustment(result, intent);
}

async function creditSubscriptionInvoice(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid" || !invoiceGrantsIncludedCredits(invoice))
    return;
  const raw = invoice as unknown as Record<string, unknown>;
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  const customerId = objectId(raw.customer);
  if (!subscriptionId) return;
  const [subscription] = await db
    .select({
      userId: schema.subscriptions.userId,
      plan: schema.subscriptions.plan,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, subscriptionId))
    .limit(1);
  if (!subscription) return;
  const plan = SUBSCRIPTION_PLANS.find(
    (candidate) => candidate.id === subscription.plan,
  );
  if (!plan || plan.includedCreditsUsd <= 0) return;
  await creditPurchaseOnce({
    userId: subscription.userId,
    creditsUsd: plan.includedCreditsUsd,
    stripeSessionId: invoice.id,
    ledgerType: "subscription_credit",
    customerId,
    note: `${plan.name}: créditos mensuales incluidos`,
  });
}

export async function processStripeEvent(stripe: Stripe, event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await reconcileWalletCheckout(stripe, event.data.object);
  } else if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await reconcileStripeSubscription(stripe, event.data.object, {
      allowCanceledSnapshot: event.type === "customer.subscription.deleted",
    });
  } else if (event.type === "invoice.paid") {
    const subscriptionId = subscriptionIdFromInvoice(event.data.object);
    if (subscriptionId)
      await reconcileStripeSubscriptionById(stripe, subscriptionId);
    await creditSubscriptionInvoice(event.data.object);
  } else if (event.type === "invoice.payment_failed") {
    const subscriptionId = subscriptionIdFromInvoice(event.data.object);
    if (subscriptionId)
      await reconcileStripeSubscriptionById(stripe, subscriptionId);
  } else if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const creditsUsd = Number(intent.metadata?.creditsUsd ?? 0);
    const userId = intent.metadata?.userId;
    if (intent.metadata?.auto_topup === "1" && userId && creditsUsd > 0) {
      await creditPurchaseOnce({
        userId,
        creditsUsd,
        stripeSessionId: intent.id,
        stripePaymentIntentId: intent.id,
        stripeAmountMinor: intent.amount_received,
        stripeCurrency: intent.currency,
        customerId: objectId(intent.customer),
        note: `Auto top-up Stripe ${creditsUsd} USD`,
      });
      await reconcileSucceededRefunds(stripe, intent);
    }
  } else if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const userId = intent.metadata?.userId;
    if (intent.metadata?.auto_topup === "1" && userId) {
      await db
        .update(schema.users)
        .set({ autoTopupEnabled: false })
        .where(eq(schema.users.id, userId));
      console.warn("Auto top-up disabled after a failed Stripe payment", {
        eventId: event.id,
        paymentIntentId: intent.id,
        userId,
      });
    }
  } else if (
    event.type === "refund.created" ||
    event.type === "refund.updated"
  ) {
    await reverseSucceededRefund(stripe, event.data.object);
  } else if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed" ||
    event.type === "charge.dispute.funds_withdrawn" ||
    event.type === "charge.dispute.funds_reinstated"
  ) {
    await reconcileDispute(stripe, event.data.object);
  }
}

export async function processStripeEventOnce(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<StripeEventOutcome> {
  await ensureDb();
  const claim = await claimStripeWebhookEvent({
    id: event.id,
    eventType: event.type,
    stripeCreatedAt: new Date(event.created * 1_000),
  });
  if (claim !== "claimed") return claim;
  try {
    await processStripeEvent(stripe, event);
    await markStripeWebhookProcessed(event.id);
    return "processed";
  } catch (error) {
    await markStripeWebhookFailed(event.id, error).catch((markError) => {
      console.error("Could not persist Stripe event failure", {
        eventId: event.id,
        message: markError instanceof Error ? markError.message : "unknown",
      });
    });
    throw error;
  }
}
