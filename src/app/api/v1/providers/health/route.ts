import { providerSnapshot } from "@/lib/gateway/health";
import { readProviderHealthRows } from "@/lib/providers/health-store";

export async function GET() {
  const live = await providerSnapshot();
  const persisted = await readProviderHealthRows();
  return Response.json({
    data: {
      circuits: live,
      probes: persisted.map((row) => ({
        provider: row.provider,
        status: row.status,
        latency_ms: row.latencyMs,
        last_check: row.lastCheck,
      })),
    },
  });
}
