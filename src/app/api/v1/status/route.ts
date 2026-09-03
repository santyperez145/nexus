import { connectionStatus } from "@/lib/connections";
import { allModels } from "@/lib/catalog";
import { isStripeOperational, recentOperationalProviderIds } from "@/lib/providers/health-store";

export async function GET() {
  const c = connectionStatus();
  const configuredProviders = new Set(c.providers.filter((p) => p.wired).map((p) => p.id));
  let operationalProviders = new Set<string>();
  let stripeVerified = false;
  try {
    [operationalProviders, stripeVerified] = await Promise.all([
      recentOperationalProviderIds(),
      isStripeOperational(),
    ]);
  } catch {
    operationalProviders = new Set();
    stripeVerified = false;
  }
  const configuredLabs = configuredProviders.size;
  const verifiedLabs = operationalProviders.size;
  const mode = verifiedLabs > 0 ? "live" : configuredLabs > 0 ? "degraded" : "unconfigured";
  const commerceConfigured = c.stripe.wired && c.stripe.webhook && c.stripe.plans;
  const inferenceOk = c.database.wired && c.redis.wired && verifiedLabs > 0;
  const commerceOk = commerceConfigured && stripeVerified;
  const ok = inferenceOk && commerceOk;
  return Response.json({
    service: "nexus",
    ok,
    mode,
    models: allModels().length,
    wired_labs: verifiedLabs,
    configured_labs: configuredLabs,
    verified_labs: verifiedLabs,
    stripe: c.stripe.wired,
    stripe_webhook: c.stripe.webhook,
    subscriptions: c.stripe.wired && c.stripe.webhook && c.stripe.plans,
    stripe_verified: stripeVerified,
    inference_ok: inferenceOk,
    commerce_ok: commerceOk,
    redis: c.redis.wired,
    postgres: c.database.wired,
    providers: Object.fromEntries(c.providers.map((p) => [p.id, operationalProviders.has(p.id)])),
    configured_providers: Object.fromEntries(c.providers.map((p) => [p.id, p.wired])),
  });
}
