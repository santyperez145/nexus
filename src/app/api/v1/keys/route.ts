import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { issueApiKey } from "@/lib/keys";
import { microsToUsd, usdToMicros } from "@/lib/money";

function serializeKey(k: typeof schema.apiKeys.$inferSelect) {
  const usage = microsToUsd(k.usageMicros);
  const limit = k.limitMicros != null ? microsToUsd(k.limitMicros) : null;
  return {
    id: k.id,
    hash: k.keyHash.slice(0, 16),
    name: k.name,
    label: k.name,
    disabled: k.disabled,
    is_management: k.isManagement,
    created_at: k.createdAt,
    updated_at: k.lastUsedAt ?? k.createdAt,
    last_used: k.lastUsedAt,
    usage,
    limit,
    limit_remaining: limit != null ? Math.max(0, limit - usage) : null,
    limit_reset: k.limitReset,
    include_byok_in_limit: k.includeByokInLimit,
    prefix: k.keyPrefix,
  };
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const keys = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, auth.userId))
      .orderBy(desc(schema.apiKeys.createdAt));
    return Response.json({ data: keys.map(serializeKey) });
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
      limitMicros: body.limit != null ? usdToMicros(Number(body.limit)) : null,
    });
    return Response.json({
      data: {
        ...created,
        key: created.key,
        limit: created.limitMicros != null ? microsToUsd(created.limitMicros) : null,
        usage: 0,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = (await req.json()) as {
      id?: string;
      name?: string;
      disabled?: boolean;
      limit?: number | null;
      include_byok_in_limit?: boolean;
      limit_reset?: string | null;
    };
    const keyId = body.id ?? new URL(req.url).searchParams.get("id");
    if (!keyId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, keyId)).limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    const patch: Partial<typeof schema.apiKeys.$inferInsert> = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (typeof body.disabled === "boolean") patch.disabled = body.disabled;
    if (body.limit === null) patch.limitMicros = null;
    else if (body.limit != null) patch.limitMicros = usdToMicros(Number(body.limit));
    if (typeof body.include_byok_in_limit === "boolean") {
      patch.includeByokInLimit = body.include_byok_in_limit;
    }
    if (body.limit_reset !== undefined) patch.limitReset = body.limit_reset;
    if (Object.keys(patch).length) {
      await db.update(schema.apiKeys).set(patch).where(eq(schema.apiKeys.id, keyId));
    }
    const [updated] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, keyId)).limit(1);
    return Response.json({ data: updated ? serializeKey(updated) : { success: true } });
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
