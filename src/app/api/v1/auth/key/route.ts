import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.apiKeyId) {
      return Response.json({
        data: {
          label: "session",
          is_management: true,
          scopes: auth.scopes,
          workspace_id: null,
          plan: auth.plan ?? "free",
          limit: null,
          usage: 0,
        },
      });
    }
    const [key] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, auth.apiKeyId)).limit(1);
    return Response.json({
      data: {
        label: key?.name,
        is_management: key?.isManagement,
        scopes: auth.scopes,
        workspace_id: auth.workspaceId ?? null,
        plan: auth.plan ?? "free",
        limit: key?.limitMicros != null ? microsToUsd(key.limitMicros) : null,
        usage: microsToUsd(key?.usageMicros ?? 0),
        limit_remaining: key?.limitMicros != null ? microsToUsd(Math.max(0, key.limitMicros - key.usageMicros)) : null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
