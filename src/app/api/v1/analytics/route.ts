import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(schema.generations)
      .where(and(eq(schema.generations.userId, auth.userId), gte(schema.generations.createdAt, since)))
      .orderBy(desc(schema.generations.createdAt))
      .limit(2000);
    const byModel = new Map<string, { tokens: number; cost: number; requests: number }>();
    const byProvider = new Map<string, { tokens: number; cost: number; requests: number }>();
    const byDay = new Map<string, { requests: number; tokens: number; cost: number }>();
    for (const r of rows) {
      const tok = r.promptTokens + r.completionTokens;
      const cost = microsToUsd(r.costMicros);
      const m = byModel.get(r.routedModel) ?? { tokens: 0, cost: 0, requests: 0 };
      m.tokens += tok;
      m.cost += cost;
      m.requests += 1;
      byModel.set(r.routedModel, m);
      const p = byProvider.get(r.provider) ?? { tokens: 0, cost: 0, requests: 0 };
      p.tokens += tok;
      p.cost += cost;
      p.requests += 1;
      byProvider.set(r.provider, p);
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      const d = byDay.get(day) ?? { requests: 0, tokens: 0, cost: 0 };
      d.requests += 1;
      d.tokens += tok;
      d.cost += cost;
      byDay.set(day, d);
    }
    const daySeries: Array<{ day: string; requests: number; tokens: number; cost: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      daySeries.push({ day: d, ...(byDay.get(d) ?? { requests: 0, tokens: 0, cost: 0 }) });
    }
    return Response.json({
      data: {
        window_days: days,
        totals: {
          requests: rows.length,
          tokens: rows.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0),
          cost: rows.reduce((s, r) => s + microsToUsd(r.costMicros), 0),
        },
        by_day: daySeries,
        by_model: [...byModel.entries()].map(([model, v]) => ({ model, ...v })),
        by_provider: [...byProvider.entries()].map(([provider, v]) => ({ provider, ...v })),
        recent: rows.slice(0, 50),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
