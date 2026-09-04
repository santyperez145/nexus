import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { guestPlaygroundEnabled } from "@/lib/config";
import { defaultScopes, enforcePathPolicy, isInferencePath } from "./acl";
import { guestAuthContext } from "./guest";
import { bindRequestId } from "./request-id";
import type { AuthContext } from "./types";
import { accessibleWorkspaceIds } from "./tenant";
import { assertControlPlaneRateLimit } from "./rate-limit";

export async function sessionAuthContext(userId: string): Promise<AuthContext> {
  await ensureDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) {
    throw Object.assign(new Error("Account not found"), { status: 401, code: "invalid_api_key" });
  }
  return {
    userId: user.id,
    billingUserId: user.id,
    workspaceIds: await accessibleWorkspaceIds(user.id),
    isManagement: true,
    scopes: ["*"],
    plan: user.plan,
    creditMicros: user.creditMicros,
    zdr: user.zdr,
    allowTraining: user.allowTraining,
    logPrompts: user.logPrompts,
  };
}

export async function authenticateRequest(req: Request): Promise<AuthContext> {
  bindRequestId(req);
  await ensureDb();
  const headerAuth = req.headers.get("authorization") ?? "";
  const token = headerAuth.toLowerCase().startsWith("bearer ")
    ? headerAuth.slice(7).trim()
    : "";

  let ctx: AuthContext;

  if (token) {
    const [key] = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.keyHash, sha256(token)))
      .limit(1);
    if (!key || key.disabled) {
      throw Object.assign(new Error("Invalid API key"), { status: 401, code: "invalid_api_key" });
    }
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, key.userId))
      .limit(1);
    if (!user) throw Object.assign(new Error("Account not found"), { status: 401, code: "invalid_api_key" });
    const workspaceIds = await accessibleWorkspaceIds(user.id);
    if (key.workspaceId && !workspaceIds.includes(key.workspaceId)) {
      throw Object.assign(new Error("API key workspace access was revoked"), {
        status: 401,
        code: "invalid_api_key",
      });
    }
    const [billingUser] = key.workspaceId
      ? await db
          .select({
            id: schema.users.id,
            plan: schema.users.plan,
            creditMicros: schema.users.creditMicros,
          })
          .from(schema.workspaces)
          .innerJoin(schema.users, eq(schema.users.id, schema.workspaces.userId))
          .where(eq(schema.workspaces.id, key.workspaceId))
          .limit(1)
      : [user];
    if (!billingUser) {
      throw Object.assign(new Error("Workspace billing account not found"), {
        status: 401,
        code: "invalid_api_key",
      });
    }
    if (key.limitMicros != null && key.usageMicros >= key.limitMicros) {
      throw Object.assign(new Error("API key credit limit reached"), { status: 402, code: "insufficient_credits" });
    }
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, key.id));
    ctx = {
      userId: user.id,
      billingUserId: billingUser.id,
      apiKeyId: key.id,
      workspaceId: key.workspaceId,
      workspaceIds,
      isManagement: key.isManagement,
      scopes: key.scopes ?? defaultScopes(key.isManagement),
      plan: billingUser.plan,
      creditMicros: billingUser.creditMicros,
      zdr: user.zdr,
      allowTraining: user.allowTraining,
      logPrompts: user.logPrompts,
    };
  } else {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      if (req.headers.get("x-nexus-guest") === "1") {
        if (!guestPlaygroundEnabled()) {
          throw Object.assign(new Error("Anonymous playground is disabled"), {
            status: 401,
            code: "invalid_api_key",
          });
        }
        ctx = guestAuthContext(req.headers);
      } else {
        throw Object.assign(new Error("Missing bearer token"), { status: 401, code: "invalid_api_key" });
      }
    } else {
      ctx = await sessionAuthContext(session.user.id);
    }
  }

  enforcePathPolicy(req, ctx);
  if (!ctx.guest && !isInferencePath(req)) {
    await assertControlPlaneRateLimit(ctx);
  }
  return ctx;
}

/**
 * Resolve the same account/API-key identity as authenticateRequest while allowing
 * a truly anonymous read. An explicit credential or guest header is never
 * downgraded to anonymous when it is invalid.
 */
export async function authenticateOptionalRequest(req: Request): Promise<AuthContext | null> {
  const authorization = req.headers.get("authorization");
  if (authorization || req.headers.get("x-nexus-guest")) {
    return authenticateRequest(req);
  }
  bindRequestId(req);
  await ensureDb();
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return authenticateRequest(req);
}

export { jsonError } from "./errors";
