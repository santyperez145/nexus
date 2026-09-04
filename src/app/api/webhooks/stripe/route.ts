import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { SUBSCRIPTION_PLANS, creditPurchaseFeeUsd, stripePriceForPlan } from "@/lib/config";
import { creditPurchaseOnce } from "@/lib/billing/stripe-credit";
import { db, ensureDb, schema, withTransaction } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String(value.id);
  return null;
}

function fromUnix(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function planFromPrice(priceId: string | null) {
  return SUBSCRIPTION_PLANS.find((plan) => stripePriceForPlan(plan.id) === priceId)?.id ?? null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const raw = subscription as unknown as Record<string, unknown>;
  const items = (raw.items as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
  const firstItem = items[0];
  const price = firstItem?.price as { id?: string } | undefined;
  const priceId = price?.id ?? null;
  const metadata = (raw.metadata ?? {}) as Record<string, string>;
  const customerId = objectId(raw.customer);
  let userId = metadata.userId;
  if (!userId && customerId) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId))
      .limit(1);
    userId = user?.id;
  }
  if (!userId || !customerId) return;

  const plan = metadata.planId || planFromPrice(priceId);
  if (!plan || !SUBSCRIPTION_PLANS.some((candidate) => candidate.id === plan)) return;
  const status = String(raw.status ?? "inactive");
  const periodStart = fromUnix(raw.current_period_start ?? firstItem?.current_period_start);
  const periodEnd = fromUnix(raw.current_period_end ?? firstItem?.current_period_end);
  const quantity = Math.max(1, Number(firstItem?.quantity ?? 1));

  await withTransaction(async (tx) => {
    await tx
      .insert(schema.subscriptions)
      .values({
        id: subscription.id,
        userId,
        customerId,
        plan,
        status,
        priceId,
        quantity,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.subscriptions.id,
        set: {
          userId,
          customerId,
          plan,
          status,
          priceId,
          quantity,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: Boolean(raw.cancel_at_period_end),
          updatedAt: new Date(),
        },
      });
    const subscriptions = await tx
      .select({ plan: schema.subscriptions.plan, status: schema.subscriptions.status })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId));
    const activeSubscriptions = subscriptions.filter(
      (candidate) => candidate.status === "active" || candidate.status === "trialing",
    );
    const effective =
      activeSubscriptions.find((candidate) => candidate.plan === "team") ??
      activeSubscriptions.find((candidate) => candidate.plan === "pro");
    await tx
      .update(schema.users)
      .set({
        stripeCustomerId: customerId,
        plan: effective?.plan ?? "free",
        subscriptionStatus: effective?.status ?? status,
      })
      .where(eq(schema.users.id, userId));
  });
}

async function creditCheckout(session: Stripe.Checkout.Session) {
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
}

async function creditSubscriptionInvoice(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid") return;
  const raw = invoice as unknown as Record<string, unknown>;
  const parent = raw.parent as
    | { subscription_details?: { subscription?: unknown; metadata?: Record<string, string> } }
    | undefined;
  const subscriptionId = objectId(parent?.subscription_details?.subscription ?? raw.subscription);
  const customerId = objectId(raw.customer);
  const metadata = parent?.subscription_details?.metadata ?? {};
  let userId = metadata.userId;
  let planId = metadata.planId;
  if (subscriptionId) {
    const [subscription] = await db
      .select({ userId: schema.subscriptions.userId, plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId))
      .limit(1);
    userId ||= subscription?.userId;
    planId ||= subscription?.plan;
  }
  if (!userId && customerId) {
    const [user] = await db
      .select({ id: schema.users.id, plan: schema.users.plan })
      .from(schema.users)
      .where(eq(schema.users.stripeCustomerId, customerId))
      .limit(1);
    userId = user?.id;
    planId ||= user?.plan;
  }
  const plan = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === planId);
  if (!userId || !plan || plan.includedCreditsUsd <= 0) return;
  await creditPurchaseOnce({
    userId,
    creditsUsd: plan.includedCreditsUsd,
    stripeSessionId: invoice.id,
    customerId,
    note: `${plan.name}: créditos mensuales incluidos`,
  });
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

  try {
    await ensureDb();
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await creditCheckout(event.data.object);
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(event.data.object);
    } else if (event.type === "invoice.paid") {
      await creditSubscriptionInvoice(event.data.object);
    } else if (event.type === "invoice.payment_failed") {
      const customerId = objectId(event.data.object.customer);
      if (customerId) {
        await db
          .update(schema.users)
          .set({ subscriptionStatus: "past_due", plan: "free" })
          .where(eq(schema.users.stripeCustomerId, customerId));
        await db
          .update(schema.subscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(schema.subscriptions.customerId, customerId));
      }
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
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
