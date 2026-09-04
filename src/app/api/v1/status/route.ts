import { connectionStatus } from "@/lib/connections";
import {
  hasExecutableEndpoint,
  isExecutableEndpoint,
  isTokenGatewayModel,
} from "@/lib/catalog";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import { isModelExecutionReady } from "@/lib/catalog/presentation";
import { isStripeOperational, recentOperationalProviderIds } from "@/lib/providers/health-store";
import { listPublicManagedProviders } from "@/lib/providers/onboarding";

export async function GET() {
  const c = connectionStatus();
  const configuredProviders = new Set(c.providers.filter((p) => p.wired).map((p) => p.id));
  let operationalProviders = new Set<string>();
  let managed: Awaited<ReturnType<typeof listPublicManagedProviders>> = [];
  let stripeVerified = false;
  try {
    [operationalProviders, stripeVerified, managed] = await Promise.all([
      recentOperationalProviderIds(),
      isStripeOperational(),
      listPublicManagedProviders(),
    ]);
  } catch {
    operationalProviders = new Set();
    stripeVerified = false;
    managed = [];
  }
  for (const provider of managed) {
    configuredProviders.add(provider.id);
    if (provider.operational) operationalProviders.add(provider.id);
  }
  const configuredLabs = configuredProviders.size;
  const verifiedLabs = operationalProviders.size;
  const catalog = await allRuntimeModels();
  const executableModels = catalog.filter(
    (model) => !model.id.startsWith("nexus/") && isModelExecutionReady(model),
  );
  const executableGatewayModels = catalog.filter(
    (model) =>
      !model.id.startsWith("nexus/") &&
      isTokenGatewayModel(model) &&
      hasExecutableEndpoint(model),
  );
  const executableProviderIds = new Set(
    executableGatewayModels.flatMap((model) =>
      model.endpoints.filter(isExecutableEndpoint).map((endpoint) => endpoint.adapter),
    ),
  );
  const verifiedExecutableLabs = [...operationalProviders].filter((provider) =>
    executableProviderIds.has(provider),
  ).length;
  const mode =
    verifiedExecutableLabs > 0 ? "live" : configuredLabs > 0 ? "degraded" : "unconfigured";
  const commerceConfigured = c.stripe.ready;
  const inferenceOk = c.database.wired && c.redis.wired && verifiedExecutableLabs > 0;
  const commerceOk = commerceConfigured && stripeVerified;
  const ok = inferenceOk && commerceOk;
  return Response.json({
    service: "nexus",
    ok,
    mode,
    models: executableModels.length,
    gateway_models: executableGatewayModels.length,
    catalog_models: catalog.filter((model) => !model.id.startsWith("nexus/")).length,
    reference_only_models: catalog.filter(
      (model) => !model.id.startsWith("nexus/") && !isModelExecutionReady(model),
    ).length,
    wired_labs: configuredLabs,
    configured_labs: configuredLabs,
    verified_labs: verifiedLabs,
    verified_executable_labs: verifiedExecutableLabs,
    stripe: c.stripe.wired,
    stripe_webhook: c.stripe.webhook,
    subscriptions: c.stripe.ready,
    stripe_mode: c.stripe.mode,
    stripe_verified: stripeVerified,
    inference_ok: inferenceOk,
    commerce_ok: commerceOk,
    redis: c.redis.wired,
    postgres: c.database.wired,
    providers: Object.fromEntries([
      ...c.providers.map((p) => [p.id, operationalProviders.has(p.id)] as const),
      ...managed.map((p) => [p.id, p.operational] as const),
    ]),
    configured_providers: Object.fromEntries([
      ...c.providers.map((p) => [p.id, p.wired] as const),
      ...managed.map((p) => [p.id, true] as const),
    ]),
  });
}
