import type Stripe from "stripe";
import { providerProbeResult, type ProviderProbe } from "@/lib/providers/probe";
import { getStripe } from "@/lib/stripe";

type StripeAccountReadiness = Pick<Stripe.Account, "charges_enabled" | "details_submitted">;

export function stripeAccountProbeResult(
  account: StripeAccountReadiness,
  latencyMs: number,
): ProviderProbe {
  if (!account.details_submitted) {
    return { ok: false, status: 200, detail: "Cuenta Stripe incompleta", latencyMs };
  }
  if (!account.charges_enabled) {
    return { ok: false, status: 200, detail: "Cobros Stripe deshabilitados", latencyMs };
  }
  return { ok: true, status: 200, detail: "Verificado · cobros habilitados", latencyMs };
}

export async function probeStripe(): Promise<ProviderProbe> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, detail: "Sin configurar", latencyMs: 0 };
  const started = Date.now();
  try {
    const account = await stripe.accounts.retrieveCurrent({}, { timeout: 8_000 });
    return stripeAccountProbeResult(account, Date.now() - started);
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : Number.NaN;
    if (Number.isFinite(status)) {
      return providerProbeResult(status, Date.now() - started);
    }
    return { ok: false, detail: "Sin respuesta", latencyMs: Date.now() - started };
  }
}
