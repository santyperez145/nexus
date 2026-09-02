import {
  NEXUS_PROVIDERS,
  authHeaders,
  envFor,
  isWired,
  modelsUrl,
} from "@/lib/providers/registry";

type Probe = { ok: boolean; status?: number; detail: string };

async function ping(url: string, headers: Record<string, string>): Promise<Probe> {
  try {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return {
      ok: res.ok || res.status === 401 || res.status === 403,
      status: res.status,
      detail: res.ok ? "API respondió" : `HTTP ${res.status} (key presente, el lab contestó)`,
    };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "sin red" };
  }
}

export async function probeConnections() {
  const stripe = process.env.STRIPE_SECRET_KEY;
  const labs = await Promise.all(
    NEXUS_PROVIDERS.map(async (p) => {
      if (!isWired(p)) return [p.id, { ok: false, detail: "sin env" } as Probe] as const;
      const key = envFor(p);
      if (!key) return [p.id, { ok: false, detail: "sin env" } as Probe] as const;
      const result = await ping(modelsUrl(p, key), authHeaders(p, key));
      return [p.id, result] as const;
    }),
  );

  const stripeProbe: Probe = stripe
    ? await ping("https://api.stripe.com/v1/balance", { Authorization: `Bearer ${stripe}` })
    : { ok: false, detail: "sin env" };

  return {
    ...Object.fromEntries(labs),
    stripe: stripeProbe,
  };
}
