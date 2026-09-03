import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import type { AuthContext } from "./types";

export async function authenticateRequest(req: Request): Promise<AuthContext> {
  await ensureDb();
  const headerAuth = req.headers.get("authorization") ?? "";
  const token = headerAuth.toLowerCase().startsWith("bearer ")
    ? headerAuth.slice(7).trim()
    : "";

  if (token) {
    const [key] = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyHash, sha256(token)))
      .limit(1);
    if (!key || key.disabled) {
      throw Object.assign(new Error("Invalid API key"), { status: 401 });
    }
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, key.userId))
      .limit(1);
    if (!user) throw Object.assign(new Error("Account not found"), { status: 401 });
    if (key.limitMicros != null && key.usageMicros >= key.limitMicros) {
      throw Object.assign(new Error("API key credit limit reached"), { status: 402 });
    }
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, key.id));
    return {
      userId: user.id,
      apiKeyId: key.id,
      workspaceId: key.workspaceId,
      isManagement: key.isManagement,
      creditMicros: user.creditMicros,
      zdr: user.zdr,
      allowTraining: user.allowTraining,
      logPrompts: user.logPrompts,
    };
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    throw Object.assign(new Error("Missing bearer token"), { status: 401 });
  }
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user) throw Object.assign(new Error("Account not found"), { status: 401 });
  return {
    userId: user.id,
    isManagement: true,
    creditMicros: user.creditMicros,
    zdr: user.zdr,
    allowTraining: user.allowTraining,
    logPrompts: user.logPrompts,
  };
}

export function jsonError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500;
  const message = error instanceof Error ? error.message : "Internal error";
  const safe = Number.isFinite(status) && status >= 400 ? status : 500;
  const code =
    safe === 401
      ? "invalid_api_key"
      : safe === 402
        ? "insufficient_credits"
        : safe === 404
          ? "model_not_found"
          : safe === 400
            ? "invalid_request"
            : safe === 429
            ? "rate_limited"
            : safe === 502
              ? "provider_error"
              : "internal_error";
  const metadata: Record<string, unknown> = {};
  if (typeof error === "object" && error && "provider" in error) {
    metadata.provider_name = (error as { provider?: string }).provider;
  }
  const headers: Record<string, string> = {};
  if (safe === 429) {
    headers["Retry-After"] = "60";
    headers["X-RateLimit-Limit"] = "60";
    headers["X-RateLimit-Remaining"] = "0";
  }
  return Response.json({ error: { message, code, metadata } }, { status: safe, headers });
}
