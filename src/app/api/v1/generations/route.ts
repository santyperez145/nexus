import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
    const model = url.searchParams.get("model")?.trim();
    const provider = url.searchParams.get("provider")?.trim();
    const byok = url.searchParams.get("byok");
    const errors = url.searchParams.get("errors");
    const days = Number(url.searchParams.get("days") ?? 0) || 0;

    const filters = [eq(schema.generations.userId, auth.userId)];
    if (model) filters.push(like(schema.generations.routedModel, `%${model}%`));
    if (provider) filters.push(eq(schema.generations.provider, provider));
    if (byok === "1") filters.push(eq(schema.generations.isByok, true));
    if (byok === "0") filters.push(eq(schema.generations.isByok, false));
    if (errors === "1") filters.push(sql`${schema.generations.error} is not null`);
    if (days > 0) {
      filters.push(gte(schema.generations.createdAt, new Date(Date.now() - days * 86400000)));
    }

    const rows = await db
      .select()
      .from(schema.generations)
      .where(and(...filters))
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
        error: row.error,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
