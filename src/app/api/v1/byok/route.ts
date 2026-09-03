import { eq } from "drizzle-orm";
import { encryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db
      .select()
      .from(schema.byokCredentials)
      .where(eq(schema.byokCredentials.userId, auth.userId));
    return Response.json({
      data: rows
        .filter((r) => !r.deleted)
        .map((r) => ({
          id: r.id,
          provider: r.provider,
          label: r.label,
          created_at: r.createdAt,
        })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const row = {
      id: id("byok"),
      userId: auth.userId,
      workspaceId: body.workspace_id ?? auth.workspaceId,
      provider: body.provider,
      encryptedKey: encryptSecret(body.key),
      label: body.label ?? body.provider,
    };
    await db.insert(schema.byokCredentials).values(row);
    return Response.json({ data: { id: row.id, provider: row.provider, label: row.label } });
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
      .from(schema.byokCredentials)
      .where(eq(schema.byokCredentials.id, idParam))
      .limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db
      .update(schema.byokCredentials)
      .set({ deleted: true, encryptedKey: "" })
      .where(eq(schema.byokCredentials.id, idParam));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
