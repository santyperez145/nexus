import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";
import { microsToUsd, usdToMicros } from "@/lib/money";

async function withBudgets(rows: (typeof schema.workspaces.$inferSelect)[]) {
  if (!rows.length) return [];
  const budgets = await db
    .select()
    .from(schema.workspaceBudgets)
    .where(
      inArray(
        schema.workspaceBudgets.workspaceId,
        rows.map((r) => r.id),
      ),
    );
  const byWs = new Map(budgets.map((b) => [b.workspaceId, b]));
  return rows.map((r) => {
    const budget = byWs.get(r.id);
    return {
      ...r,
      budget: budget
        ? {
            interval: budget.interval,
            limit: microsToUsd(budget.limitMicros),
            spent: microsToUsd(budget.spentMicros),
          }
        : null,
    };
  });
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const rows = await db.select().from(schema.workspaces).where(eq(schema.workspaces.userId, auth.userId));
    return Response.json({ data: await withBudgets(rows) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const row = {
      id: id("ws"),
      userId: auth.userId,
      name: body.name ?? "Workspace",
      slug: (body.slug ?? body.name ?? "workspace").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      isDefault: false,
    };
    await db.insert(schema.workspaces).values(row);
    if (body.limit != null) {
      await db.insert(schema.workspaceBudgets).values({
        id: id("wbud"),
        workspaceId: row.id,
        interval: body.interval ?? "monthly",
        limitMicros: usdToMicros(Number(body.limit)),
      });
    }
    const [created] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, row.id)).limit(1);
    const [mapped] = await withBudgets(created ? [created] : []);
    return Response.json({ data: mapped ?? row });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const workspaceId = body.id as string | undefined;
    if (!workspaceId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    if (!ws || ws.userId !== auth.userId) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    if (typeof body.name === "string") {
      await db.update(schema.workspaces).set({ name: body.name }).where(eq(schema.workspaces.id, workspaceId));
    }
    if (body.limit != null) {
      const [existing] = await db
        .select()
        .from(schema.workspaceBudgets)
        .where(eq(schema.workspaceBudgets.workspaceId, workspaceId))
        .limit(1);
      if (existing) {
        await db
          .update(schema.workspaceBudgets)
          .set({
            limitMicros: usdToMicros(Number(body.limit)),
            interval: body.interval ?? existing.interval,
          })
          .where(eq(schema.workspaceBudgets.id, existing.id));
      } else {
        await db.insert(schema.workspaceBudgets).values({
          id: id("wbud"),
          workspaceId,
          interval: body.interval ?? "monthly",
          limitMicros: usdToMicros(Number(body.limit)),
        });
      }
    }
    const [fresh] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    const [mapped] = await withBudgets(fresh ? [fresh] : []);
    return Response.json({ data: mapped });
  } catch (error) {
    return jsonError(error);
  }
}
