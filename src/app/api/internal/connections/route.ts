import { getSession } from "@/lib/auth";
import { connectionStatus } from "@/lib/connections";
import { probeConnections } from "@/lib/connections-probe";
import { syncCatalog } from "@/lib/catalog/sync";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ data: connectionStatus() });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "sync-catalog") {
    const result = await syncCatalog();
    return Response.json({ data: result });
  }
  if (body.action === "probe") {
    const probes = await probeConnections();
    return Response.json({ data: probes });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
}
