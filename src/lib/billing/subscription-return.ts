const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export type SubscriptionReturn = {
  state: "idle" | "pending" | "confirmed";
  notice: string | null;
};

export function resolveSubscriptionReturn(
  result: string | null,
  status?: string | null,
  plan?: string | null,
): SubscriptionReturn {
  if (result !== "ok") return { state: "idle", notice: null };

  if (status && ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    const normalizedPlan = plan?.trim();
    const planName =
      normalizedPlan === "pro"
        ? "Pro"
        : normalizedPlan === "team"
          ? "Team"
          : normalizedPlan || "seleccionado";
    return {
      state: "confirmed",
      notice: `Plan ${planName} activo.`,
    };
  }

  return {
    state: "pending",
    notice: "Confirmando suscripción con Stripe…",
  };
}
