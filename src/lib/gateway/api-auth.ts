import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { enforcePathPolicy } from "./acl";
import { guestAuthContext } from "./guest";
import { bindRequestId } from "./request-id";
import type { AuthContext } from "./types";

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
    if (key.limitMicros != null && key.usageMicros >= key.limitMicros) {
      throw Object.assign(new Error("API key credit limit reached"), { status: 402, code: "insufficient_credits" });
    }
    await db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, key.id));
    ctx = {
      userId: user.id,
      apiKeyId: key.id,
      workspaceId: key.workspaceId,
      isManagement: key.isManagement,
      creditMicros: user.creditMicros,
      zdr: user.zdr,
      allowTraining: user.allowTraining,
      logPrompts: user.logPrompts,
    };
  } else {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      if (req.headers.get("x-nexus-guest") === "1") {
        ctx = guestAuthContext();
      } else {
        throw Object.assign(new Error("Missing bearer token"), { status: 401, code: "invalid_api_key" });
      }
    } else {
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, session.user.id))
        .limit(1);
      if (!user) throw Object.assign(new Error("Account not found"), { status: 401, code: "invalid_api_key" });
      ctx = {
        userId: user.id,
        isManagement: true,
        creditMicros: user.creditMicros,
        zdr: user.zdr,
        allowTraining: user.allowTraining,
        logPrompts: user.logPrompts,
      };
    }
  }

  enforcePathPolicy(req, ctx);
  return ctx;
}

export { jsonError } from "./errors";
