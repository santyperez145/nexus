import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { SUBSCRIPTION_PLANS, creditPurchaseFeeUsd } from "@/lib/config";
import { creditPurchaseOnce } from "@/lib/billing/stripe-credit";
import { ensureAutoTopupPaymentMethod } from "@/lib/billing/stripe-payment-method";
import {
  reconcileStripeSubscription,
  reconcileStripeSubscriptionById,
  subscriptionIdFromInvoice,
} from "@/lib/billing/stripe-subscription";
import {
  claimStripeWebhookEvent,
  markStripeWebhookFailed,
  markStripeWebhookProcessed,
} from "@/lib/billing/stripe-webhook-event";
import { db, ensureDb, schema } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String(value.id);
  return null;
}

async function creditCheckout(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return;
  const userId = session.metadata?.userId;
  const creditsUsd = Number(session.metadata?.creditsUsd ?? 0);
  if (!userId || !(creditsUsd > 0)) return;
  await creditPurchaseOnce({
    userId,
    creditsUsd,
    stripeSessionId: session.id,
    customerId: objectId(session.customer),
    note: `Compra Stripe ${creditsUsd} USD (fee ${creditPurchaseFeeUsd(creditsUsd).toFixed(2)} USD en el cargo)`,
  });
  await ensureAutoTopupPaymentMethod(stripe, session);
}

async function creditSubscriptionInvoice(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid") return;
  const raw = invoice as unknown as Record<string, unknown>;
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  const customerId = objectId(raw.customer);
  if (!subscriptionId) return;
  const [subscription] = await db
    .select({ userId: schema.subscriptions.userId, plan: schema.subscriptions.plan })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, subscriptionId))
    .limit(1);
  if (!subscription) return;
  const plan = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === subscription.plan);
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

async function processStripeEvent(stripe: Stripe, event: Stripe.Event) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await creditCheckout(stripe, event.data.object);
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
    if (subscriptionId) await reconcileStripeSubscriptionById(stripe, subscriptionId);
    await creditSubscriptionInvoice(event.data.object);
  } else if (event.type === "invoice.payment_failed") {
    const subscriptionId = subscriptionIdFromInvoice(event.data.object);
    if (subscriptionId) await reconcileStripeSubscriptionById(stripe, subscriptionId);
  } else if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const creditsUsd = Number(intent.metadata?.creditsUsd ?? 0);
    const userId = intent.metadata?.userId;
    if (intent.metadata?.auto_topup === "1" && userId && creditsUsd > 0) {
      await creditPurchaseOnce({
        userId,
        creditsUsd,
        stripeSessionId: intent.id,
        customerId: objectId(intent.customer),
        note: `Auto top-up Stripe ${creditsUsd} USD`,
      });
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
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return Response.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let claimed = false;
  try {
    await ensureDb();
    const claim = await claimStripeWebhookEvent({
      id: event.id,
      eventType: event.type,
      stripeCreatedAt: new Date(event.created * 1_000),
    });
    if (claim === "already_processed") {
      return Response.json({ received: true, duplicate: true, state: claim });
    }
    if (claim === "already_processing") {
      return Response.json(
        { received: false, retry: true, state: claim },
        { status: 409 },
      );
    }
    claimed = true;
    await processStripeEvent(stripe, event);
    await markStripeWebhookProcessed(event.id);
    return Response.json({ received: true });
  } catch (error) {
    if (claimed) {
      await markStripeWebhookFailed(event.id, error).catch((markError) => {
        console.error("Could not persist Stripe webhook failure", {
          eventId: event.id,
          message: markError instanceof Error ? markError.message : "unknown",
        });
      });
    }
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
