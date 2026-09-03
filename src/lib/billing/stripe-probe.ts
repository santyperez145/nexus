import { providerProbeResult, type ProviderProbe } from "@/lib/providers/probe";

export async function probeStripe(): Promise<ProviderProbe> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return { ok: false, detail: "Sin configurar", latencyMs: 0 };
  const started = Date.now();
  try {
    const response = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return providerProbeResult(response.status, Date.now() - started);
  } catch {
    return { ok: false, detail: "Sin respuesta", latencyMs: Date.now() - started };
  }
}
