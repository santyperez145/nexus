import { isIP } from "node:net";

type RuntimeEnv = Partial<Record<string, string | undefined>>;

export function trustedClientIpHeaders(env: RuntimeEnv = process.env) {
  if (env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PUBLIC_DOMAIN) return ["x-real-ip"];
  if (env.VERCEL === "1" || env.VERCEL_ENV) return ["x-vercel-forwarded-for"];
  if (env.FLY_APP_NAME) return ["fly-client-ip"];
  if (env.CF_PAGES === "1") return ["cf-connecting-ip"];
  if (env.NODE_ENV === "production") return [];
  return ["x-forwarded-for", "x-real-ip", "fly-client-ip", "cf-connecting-ip"];
}

function validSingleIp(value: string | null) {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate || candidate.includes(",") || !isIP(candidate)) return null;
  return candidate;
}

/** Resolve only headers asserted by the active hosting edge. Unknown production hosts fail closed. */
export function clientIp(headers?: Headers, env: RuntimeEnv = process.env) {
  if (!headers) return null;
  const trustedHeaders = trustedClientIpHeaders(env);
  for (const header of trustedHeaders) {
    const raw = headers.get(header);
    if (env.NODE_ENV !== "production" && header === "x-forwarded-for" && raw?.includes(",")) {
      const localCandidate = validSingleIp(raw.split(",")[0] ?? null);
      if (localCandidate) return localCandidate;
    }
    const candidate = validSingleIp(raw);
    if (candidate) return candidate;
  }
  return null;
}

export function clientIpKey(headers?: Headers, env: RuntimeEnv = process.env) {
  return clientIp(headers, env) ?? "unknown";
}
