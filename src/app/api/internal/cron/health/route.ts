import { authorizeCronRequest } from "@/lib/cron/authorize";
import { probeAndPersistPlatformHealth } from "@/lib/providers/health-store";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }
  const result = await probeAndPersistPlatformHealth();
  return Response.json({
    checked_at: new Date().toISOString(),
    verified_providers:
      Object.values(result.providers).filter((probe) => probe.ok).length +
      Object.values(result.managedProviders).filter((probe) => probe.ok).length,
    managed_providers: Object.values(result.managedProviders).filter((probe) => probe.ok).length,
    stripe: result.stripe.ok,
  });
}

export const POST = GET;
