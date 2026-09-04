import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { SUBSCRIPTION_PLANS, stripePriceForPlan } from "@/lib/config";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";

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

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const ACTION_REQUIRED_STATUSES = ["past_due", "unpaid", "incomplete", "paused"];

type EntitlementSubscription = {
  plan: string;
  status: string;
  updatedAt: Date;
};

export function effectiveSubscription(subscriptions: EntitlementSubscription[]) {
  const active = subscriptions.filter((candidate) => ACTIVE_STATUSES.has(candidate.status));
  const effective =
    active.find((candidate) => candidate.plan === "team") ??
    active.find((candidate) => candidate.plan === "pro") ??
    active[0];
  if (effective) return effective;

  const newest = [...subscriptions].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  );
  return (
    ACTION_REQUIRED_STATUSES.map((status) =>
      newest.find((candidate) => candidate.status === status),
    ).find(Boolean) ?? newest[0]
  );
}

async function recomputeUserEntitlements(
  tx: DbExecutor,
  userId: string,
  customerId: string,
) {
  const subscriptions = await tx
    .select({
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
      updatedAt: schema.subscriptions.updatedAt,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId));
  const effective = effectiveSubscription(subscriptions);
  const active = effective && ACTIVE_STATUSES.has(effective.status);
  await tx
    .update(schema.users)
    .set({
      stripeCustomerId: customerId,
      plan: active ? effective.plan : "free",
      subscriptionStatus: effective?.status ?? "inactive",
    })
    .where(eq(schema.users.id, userId));
}

export async function syncStripeSubscription(subscription: Stripe.Subscription) {
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
  if (!userId || !customerId) return null;

  const plan = metadata.planId || planFromPrice(priceId);
  if (!plan || !SUBSCRIPTION_PLANS.some((candidate) => candidate.id === plan)) return null;
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
    await recomputeUserEntitlements(tx, userId, customerId);
  });
  return { userId, customerId, plan, status };
}

export async function reconcileStripeSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  options: { allowCanceledSnapshot?: boolean } = {},
) {
  try {
    const canonical = await stripe.subscriptions.retrieve(subscription.id);
    return syncStripeSubscription(canonical);
  } catch (error) {
    if (options.allowCanceledSnapshot && subscription.status === "canceled") {
      return syncStripeSubscription(subscription);
    }
    throw error;
  }
}

export async function reconcileStripeSubscriptionById(stripe: Stripe, subscriptionId: string) {
  const canonical = await stripe.subscriptions.retrieve(subscriptionId);
  return syncStripeSubscription(canonical);
}

export function subscriptionIdFromInvoice(invoice: Stripe.Invoice) {
  const raw = invoice as unknown as Record<string, unknown>;
  const parent = raw.parent as
    | { subscription_details?: { subscription?: unknown } }
    | undefined;
  return objectId(parent?.subscription_details?.subscription ?? raw.subscription);
}
