import { connectionStatus } from "@/lib/connections";
import { allModels } from "@/lib/catalog";

export async function GET() {
  const c = connectionStatus();
  const wiredLabs = c.providers.filter((p) => p.wired).length;
  const mode = wiredLabs > 0 ? "live" : "unconfigured";
  const ok = c.database.wired && c.redis.wired && wiredLabs > 0;
  return Response.json({
    service: "nexus",
    ok,
    mode,
    models: allModels().length,
    wired_labs: wiredLabs,
    stripe: c.stripe.wired,
    stripe_webhook: c.stripe.webhook,
    subscriptions: c.stripe.wired && c.stripe.webhook && c.stripe.plans,
    redis: c.redis.wired,
    postgres: c.database.wired,
    providers: Object.fromEntries(c.providers.map((p) => [p.id, p.wired])),
  });
}
