import { commercialLaunchReady, readinessSnapshot } from "@/lib/health/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await readinessSnapshot();
  const ready = commercialLaunchReady(snapshot);
  return Response.json({ ...snapshot, infrastructureOk: snapshot.ok, ok: ready }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
