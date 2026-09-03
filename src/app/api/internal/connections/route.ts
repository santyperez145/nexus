import { getSession } from "@/lib/auth";
import { connectionStatus } from "@/lib/connections";
import { probeConnections } from "@/lib/connections-probe";
import { syncCatalog } from "@/lib/catalog/sync";
import { isPlatformAdmin } from "@/lib/config";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ data: { ...connectionStatus(), platformAdmin: isPlatformAdmin(session.user.email) } });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(session.user.email)) {
    return Response.json({ error: "Platform admin required" }, { status: 403 });
  }
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
