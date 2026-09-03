import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import type { AuthContext } from "./types";

export async function writeAudit(
  auth: AuthContext,
  action: string,
  opts: { resource?: string; resourceId?: string; meta?: Record<string, unknown>; headers?: Headers } = {},
) {
  if (auth.guest) return;
  try {
    await db.insert(schema.auditLogs).values({
      id: id("aud"),
      userId: auth.userId,
      workspaceId: auth.workspaceId ?? null,
      action,
      resource: opts.resource ?? null,
      resourceId: opts.resourceId ?? null,
      ip: opts.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? opts.headers?.get("x-real-ip") ?? null,
      meta: opts.meta ?? null,
    });
  } catch {
    /* audit must never break the request */
  }
}
