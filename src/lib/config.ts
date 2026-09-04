export const APP_NAME = "Nexus";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.FLY_APP_NAME
        ? `https://${process.env.FLY_APP_NAME}.fly.dev`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000");

/** Fee sobre la carga de créditos, no sobre la inferencia de pool. */
export const CREDIT_PURCHASE_FEE = 0.05;
export const CREDIT_PURCHASE_MIN_FEE_USD = 0.8;

/** Revenue collected on a wallet top-up before processor fees and taxes. */
export function creditPurchaseFeeUsd(creditsUsd: number) {
  if (!Number.isFinite(creditsUsd) || creditsUsd <= 0) return 0;
  return Math.max(
    CREDIT_PURCHASE_MIN_FEE_USD,
    creditsUsd * CREDIT_PURCHASE_FEE,
  );
}

/** Fee de plataforma sobre el precio de lista cuando la inferencia usa BYOK. */
export const BYOK_FEE = 0.05;

export const FREE_MODEL_RPD_NO_CREDITS = 50;
export const FREE_MODEL_RPD_WITH_CREDITS = 1000;
export const FREE_MODEL_CREDITS_THRESHOLD_USD = 10;

/** Opt-in. Default off: no créditos de bienvenida sin verificación. */
export function signupBonusMicros() {
  return process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_SIGNUP_BONUS === "true"
    ? 1_000_000
    : 0;
}

/** Opt-in. Default off: no auto-grant ni top-up de wallet sin Stripe. */
export function manualCreditsEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_MANUAL_CREDITS === "true"
  );
}

/** The anonymous echo is a development aid, never a production API surface. */
export function guestPlaygroundEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_GUEST_PLAYGROUND !== "false"
  );
}

export const KEY_PREFIX = "sk-nx-";
export const MANAGEMENT_KEY_PREFIX = "sk-nx-mgmt-";

export const CREDIT_PACKS = [
  { id: "10", usd: 10, label: "$10" },
  { id: "25", usd: 25, label: "$25" },
  { id: "50", usd: 50, label: "$50" },
  { id: "100", usd: 100, label: "$100" },
  { id: "500", usd: 500, label: "$500" },
] as const;

export const SUBSCRIPTION_PLANS = [
  {
    id: "pro",
    name: "Pro",
    monthlyUsd: 19,
    includedCreditsUsd: 5,
    seats: false,
    description: "600 RPM, hasta 25 claves API y 5 espacios de trabajo.",
  },
  {
    id: "team",
    name: "Team",
    monthlyUsd: 49,
    includedCreditsUsd: 15,
    seats: true,
    description: "1.800 RPM, 250 claves API y espacios compartidos con roles.",
  },
] as const;

export type SubscriptionPlanId = (typeof SUBSCRIPTION_PLANS)[number]["id"];

export function stripePriceForPlan(planId: SubscriptionPlanId) {
  return planId === "pro"
    ? process.env.STRIPE_PRICE_PRO_MONTHLY
    : process.env.STRIPE_PRICE_TEAM_MONTHLY;
}

export function stripePortalConfigurationId() {
  return process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || null;
}

export function stripeMode() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) return "unconfigured" as const;
  if (/^[sr]k_test_/.test(key)) return "test" as const;
  if (/^[sr]k_live_/.test(key)) return "live" as const;
  return "unknown" as const;
}

/**
 * Stripe Tax must be explicitly enabled only after registrations and Tax
 * settings exist in the active Stripe environment. Otherwise Checkout can
 * succeed while silently collecting zero tax.
 */
export function stripeAutomaticTaxEnabled() {
  return process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
}

export const PLAN_LIMITS = {
  guest: { rpm: 8, apiKeys: 0, workspaces: 0, historyDays: 0 },
  free: { rpm: 60, apiKeys: 3, workspaces: 1, historyDays: 7 },
  pro: { rpm: 600, apiKeys: 25, workspaces: 5, historyDays: 90 },
  team: { rpm: 1800, apiKeys: 250, workspaces: 100, historyDays: 365 },
} as const;

export function limitsForPlan(plan?: string) {
  return PLAN_LIMITS[
    plan === "team" || plan === "pro" || plan === "guest" ? plan : "free"
  ];
}

export function isPlatformAdmin(email?: string | null) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
