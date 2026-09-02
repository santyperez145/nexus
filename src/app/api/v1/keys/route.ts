import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { issueApiKey } from "@/lib/keys";
import { usdToMicros } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const keys = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, auth.userId))
      .orderBy(desc(schema.apiKeys.createdAt));
    return Response.json({
      data: keys.map((k) => ({
        id: k.id,
        hash: k.keyHash.slice(0, 16),
        name: k.name,
        label: k.name,
        disabled: k.disabled,
        is_management: k.isManagement,
        created_at: k.createdAt,
        last_used: k.lastUsedAt,
        usage: k.usageMicros,
        limit: k.limitMicros,
        prefix: k.keyPrefix,
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
    const created = await issueApiKey({
      userId: auth.userId,
      workspaceId: body.workspace_id ?? auth.workspaceId ?? null,
      name: body.name ?? body.label ?? "Default",
      isManagement: Boolean(body.is_management),
    });
    return Response.json({
      data: {
        ...created,
        limitMicros: body.limit != null ? usdToMicros(Number(body.limit)) : null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get("id");
    if (!keyId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, keyId)).limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
