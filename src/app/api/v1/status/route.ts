import { connectionStatus } from "@/lib/connections";
import { allModels } from "@/lib/catalog";

export async function GET() {
  const c = connectionStatus();
  return Response.json({
    service: "nexus",
    ok: true,
    models: allModels().length,
    stripe: c.stripe.wired,
    redis: c.redis.wired,
    postgres: c.database.wired,
    providers: Object.fromEntries(c.providers.map((p) => [p.id, p.wired])),
  });
}
