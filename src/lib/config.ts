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
export const CREDIT_PURCHASE_FEE = 0.049;

/** Fee de plataforma sobre el precio de lista cuando la inferencia usa BYOK. */
export const BYOK_FEE = 0.05;

export const FREE_MODEL_RPD_NO_CREDITS = 50;
export const FREE_MODEL_RPD_WITH_CREDITS = 1000;
export const FREE_MODEL_CREDITS_THRESHOLD_USD = 10;

/** Opt-in. Default off: no créditos de bienvenida sin verificación. */
export function signupBonusMicros() {
  return process.env.ENABLE_SIGNUP_BONUS === "true" ? 1_000_000 : 0;
}

/** Opt-in. Default off: no auto-grant ni top-up de wallet sin Stripe. */
export function manualCreditsEnabled() {
  return process.env.ENABLE_MANUAL_CREDITS === "true";
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
