import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { issueApiKey } from "@/lib/keys";
import { microsToUsd, usdToMicros } from "@/lib/money";
import { defaultScopes, normalizeApiKeyScopes, scopeAllows } from "@/lib/gateway/acl";
import { resolveOwnedWorkspace } from "@/lib/gateway/tenant";
import { limitsForPlan } from "@/lib/config";

function ownsKey(auth: { userId: string; workspaceId?: string | null }, row: typeof schema.apiKeys.$inferSelect) {
  return row.userId === auth.userId && (!auth.workspaceId || row.workspaceId === auth.workspaceId);
}

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
    scopes: k.scopes ?? defaultScopes(k.isManagement),
    created_at: k.createdAt,
    updated_at: k.lastUsedAt ?? k.createdAt,
    last_used: k.lastUsedAt,
    usage,
    limit,
    limit_remaining: limit != null ? Math.max(0, limit - usage) : null,
    limit_reset: k.limitReset,
    include_byok_in_limit: k.includeByokInLimit,
    prefix: k.keyPrefix,
    workspace_id: k.workspaceId,
  };
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const keys = await db
      .select()
      .from(schema.apiKeys)
      .where(
        auth.workspaceId
          ? and(eq(schema.apiKeys.userId, auth.userId), eq(schema.apiKeys.workspaceId, auth.workspaceId))
          : eq(schema.apiKeys.userId, auth.userId),
      )
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
    if (body.rotate_id) {
      const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, body.rotate_id)).limit(1);
      if (!row || !ownsKey(auth, row)) {
        return jsonError(Object.assign(new Error("not found"), { status: 404 }));
      }
      const created = await issueApiKey({
        userId: auth.userId,
        workspaceId: row.workspaceId,
        name: row.name,
        isManagement: row.isManagement,
        limitMicros: row.limitMicros,
        limitReset: row.limitReset,
        includeByokInLimit: row.includeByokInLimit,
        scopes: row.scopes ?? undefined,
      });
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, row.id));
      return Response.json({
        data: {
          ...created,
          key: created.key,
          limit: created.limitMicros != null ? microsToUsd(created.limitMicros) : null,
          usage: 0,
        },
      });
    }
    const isManagement = Boolean(body.is_management);
    const [existingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, auth.userId));
    const maxKeys = limitsForPlan(auth.plan).apiKeys;
    if (Number(existingCount?.count ?? 0) >= maxKeys) {
      return jsonError(
        Object.assign(new Error(`Plan limit reached (${maxKeys} API keys)`), {
          status: 403,
          code: "plan_limit",
        }),
      );
    }
    const scopes = normalizeApiKeyScopes(body.scopes, isManagement);
    if (auth.apiKeyId && scopes.some((scope) => !scopeAllows(auth.scopes, scope))) {
      return jsonError(Object.assign(new Error("cannot delegate scopes you do not have"), { status: 403 }));
    }
    const workspaceId = await resolveOwnedWorkspace(auth, body.workspace_id);
    const created = await issueApiKey({
      userId: auth.userId,
      workspaceId,
      name: body.name ?? body.label ?? "Default",
      isManagement,
      limitMicros: body.limit != null ? usdToMicros(Number(body.limit)) : null,
      scopes,
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
      scopes?: unknown;
    };
    const keyId = body.id ?? new URL(req.url).searchParams.get("id");
    if (!keyId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, keyId)).limit(1);
    if (!row || !ownsKey(auth, row)) {
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
    if (body.scopes !== undefined) {
      const scopes = normalizeApiKeyScopes(body.scopes, row.isManagement);
      if (auth.apiKeyId && scopes.some((scope) => !scopeAllows(auth.scopes, scope))) {
        return jsonError(Object.assign(new Error("cannot delegate scopes you do not have"), { status: 403 }));
      }
      patch.scopes = scopes;
    }
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
    if (!row || !ownsKey(auth, row)) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
