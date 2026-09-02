import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.apiKeyId) {
      return Response.json({ data: { label: "session", is_management: true, limit: null, usage: 0 } });
    }
    const [key] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, auth.apiKeyId)).limit(1);
    return Response.json({
      data: {
        label: key?.name,
        is_management: key?.isManagement,
        limit: key?.limitMicros != null ? microsToUsd(key.limitMicros) : null,
        usage: microsToUsd(key?.usageMicros ?? 0),
        limit_remaining: key?.limitMicros != null ? microsToUsd(key.limitMicros - key.usageMicros) : null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
