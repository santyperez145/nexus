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
        streamed: row.streamed,
        cancelled: false,
        provider_name: row.provider,
        generation_time: row.latencyMs,
        tokens_prompt: row.promptTokens,
        tokens_completion: row.completionTokens,
        native_tokens_prompt: row.promptTokens,
        native_tokens_completion: row.completionTokens,
        native_tokens_reasoning: row.reasoningTokens,
        native_tokens_cached: Number(
          (row.metadata as { cached_tokens?: number } | null)?.cached_tokens ?? 0,
        ),
        total_cost: microsToUsd(row.costMicros),
        finish_reason: row.finishReason,
        created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
        origin: row.appTitle,
        is_byok: row.isByok,
        app_referer: row.appReferer,
        latency: row.latencyMs,
        error: row.error,
        metadata: row.metadata,
        requested_model: row.requestedModel,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
