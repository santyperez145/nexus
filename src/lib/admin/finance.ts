import { SUBSCRIPTION_PLANS, creditPurchaseFeeUsd } from "@/lib/config";

export function registeredMrrUsd(
  subscriptions: Array<{ plan: string; status: string; quantity: number }>,
) {
  return subscriptions.reduce((sum, subscription) => {
    if (subscription.status !== "active") return sum;
    const plan = SUBSCRIPTION_PLANS.find((candidate) => candidate.id === subscription.plan);
    return sum + (plan?.monthlyUsd ?? 0) * subscription.quantity;
  }, 0);
}

export function quotedTopupFeesUsd(
  groups: Array<{ micros: number; count: number }>,
) {
  return groups.reduce(
    (sum, group) => sum + creditPurchaseFeeUsd(group.micros / 1_000_000) * group.count,
    0,
  );
}

export function walletLiabilityMicros(availableMicros: number, heldMicros: number) {
  return Math.max(0, availableMicros) + Math.max(0, heldMicros);
}
