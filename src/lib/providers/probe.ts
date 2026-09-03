import {
  authHeaders,
  envFor,
  isWired,
  modelsUrl,
  type NexusProvider,
} from "./registry";

export type ProviderProbe = { ok: boolean; status?: number; detail: string; latencyMs: number };

export const PROVIDER_HEALTH_FRESH_MS = 30 * 60 * 1000;

export function providerProbeResult(status: number, latencyMs: number): ProviderProbe {
  if (status >= 200 && status < 300) {
    return { ok: true, status, detail: `Verificado · HTTP ${status}`, latencyMs };
  }
  if (status === 401 || status === 403) {
    return { ok: false, status, detail: `Credencial rechazada · HTTP ${status}`, latencyMs };
  }
  return { ok: false, status, detail: `Respuesta no válida · HTTP ${status}`, latencyMs };
}

export async function probeProvider(provider: NexusProvider): Promise<ProviderProbe> {
  if (!isWired(provider)) return { ok: false, detail: "Sin configurar", latencyMs: 0 };
  const key = envFor(provider);
  if (!key) return { ok: false, detail: "Sin configurar", latencyMs: 0 };
  const started = Date.now();
  try {
    const response = await fetch(modelsUrl(provider, key), {
      headers: authHeaders(provider, key),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return providerProbeResult(response.status, Date.now() - started);
  } catch {
    return { ok: false, detail: "Sin respuesta", latencyMs: Date.now() - started };
  }
}

export function isRecentHealthy(
  row: { status: string; lastCheck: Date | string },
  now = Date.now(),
) {
  const checkedAt = new Date(row.lastCheck).getTime();
  const age = now - checkedAt;
  return (
    row.status === "up" &&
    Number.isFinite(checkedAt) &&
    age >= -60_000 &&
    age <= PROVIDER_HEALTH_FRESH_MS
  );
}
