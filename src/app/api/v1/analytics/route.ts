import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.userId, auth.userId))
      .orderBy(desc(schema.generations.createdAt))
      .limit(500);
    const byModel = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const r of rows) {
      const cur = byModel.get(r.routedModel) ?? { tokens: 0, cost: 0, requests: 0 };
      cur.tokens += r.promptTokens + r.completionTokens;
      cur.cost += microsToUsd(r.costMicros);
      cur.requests += 1;
      byModel.set(r.routedModel, cur);
    }
    return Response.json({
      data: {
        totals: {
          requests: rows.length,
          tokens: rows.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0),
          cost: rows.reduce((s, r) => s + microsToUsd(r.costMicros), 0),
        },
        by_model: [...byModel.entries()].map(([model, v]) => ({ model, ...v })),
        recent: rows.slice(0, 50),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
