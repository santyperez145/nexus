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

export { jsonError } from "./errors";
