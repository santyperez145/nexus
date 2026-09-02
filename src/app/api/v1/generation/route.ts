import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, id)).limit(1);
    if (!row || row.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("Generation not found"), { status: 404 }));
    }
    return Response.json({
      data: {
        id: row.id,
        model: row.routedModel,
        provider_name: row.provider,
        streamed: row.streamed,
        generation_time: row.latencyMs,
        tokens_prompt: row.promptTokens,
        tokens_completion: row.completionTokens,
        native_tokens_prompt: row.promptTokens,
        native_tokens_completion: row.completionTokens,
        total_cost: microsToUsd(row.costMicros),
        finish_reason: row.finishReason,
        created_at: row.createdAt,
        origin: row.appTitle,
        is_byok: row.isByok,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
