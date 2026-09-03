import { connectionStatus } from "@/lib/connections";
import { allModels } from "@/lib/catalog";

export async function GET() {
  const c = connectionStatus();
  const wiredLabs = c.providers.filter((p) => p.wired).length;
  const mode = wiredLabs > 0 ? "live" : "echo";
  // ok = núcleo usable (DB). Labs opcionales → echo local sigue siendo tip-to-tip.
  const ok = c.database.wired;
  return Response.json({
    service: "nexus",
    ok,
    mode,
    models: allModels().length,
    wired_labs: wiredLabs,
    stripe: c.stripe.wired,
    redis: c.redis.wired,
    postgres: c.database.wired,
    providers: Object.fromEntries(c.providers.map((p) => [p.id, p.wired])),
  });
}
