import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db
      .select()
      .from(schema.observabilityDestinations)
      .where(eq(schema.observabilityDestinations.userId, auth.userId));
    return Response.json({ data: rows.filter((r) => !r.deleted) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const row = {
      id: id("obs"),
      userId: auth.userId,
      workspaceId: body.workspace_id ?? auth.workspaceId,
      type: body.type ?? "webhook",
      name: body.name ?? "Webhook",
      config: body.config ?? { url: body.url },
    };
    await db.insert(schema.observabilityDestinations).values(row);
    return Response.json({ data: row });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const idParam = new URL(req.url).searchParams.get("id");
    if (!idParam) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db
      .select()
      .from(schema.observabilityDestinations)
      .where(eq(schema.observabilityDestinations.id, idParam))
      .limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db
      .update(schema.observabilityDestinations)
      .set({ deleted: true })
      .where(eq(schema.observabilityDestinations.id, idParam));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
