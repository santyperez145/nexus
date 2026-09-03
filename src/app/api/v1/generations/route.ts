import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const rows = await db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.userId, auth.userId))
      .orderBy(desc(schema.generations.createdAt))
      .limit(limit);
    return Response.json({
      data: rows.map((row) => ({
        id: row.id,
        model: row.routedModel,
        streamed: row.streamed,
        provider_name: row.provider,
        generation_time: row.latencyMs,
        tokens_prompt: row.promptTokens,
        tokens_completion: row.completionTokens,
        native_tokens_reasoning: row.reasoningTokens,
        total_cost: microsToUsd(row.costMicros),
        finish_reason: row.finishReason,
        created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
        origin: row.appTitle,
        is_byok: row.isByok,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
