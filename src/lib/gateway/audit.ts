import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { clientIp } from "@/lib/network/client-ip";
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
      ip: clientIp(opts.headers),
      meta: opts.meta ?? null,
    });
  } catch (error) {
    // Availability stays fail-open, but the loss of an audit event must be visible to operators.
    console.error("Nexus audit event could not be persisted", {
      action,
      userId: auth.userId,
      workspaceId: auth.workspaceId ?? null,
      message: error instanceof Error ? error.message : "unknown audit persistence error",
    });
  }
}
