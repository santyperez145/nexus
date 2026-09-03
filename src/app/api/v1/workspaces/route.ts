import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { id } from "@/lib/ids";
import { slugify } from "@/lib/slug";
import { microsToUsd, usdToMicros } from "@/lib/money";
import {
  canManageOrganization,
  canManageWorkspace,
} from "@/lib/gateway/tenant";
import { limitsForPlan } from "@/lib/config";

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
      includeByokInBudgets: r.includeByokInBudgets,
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
    const workspaceIds = auth.workspaceId ? [auth.workspaceId] : (auth.workspaceIds ?? []);
    const rows = workspaceIds.length
      ? await db
          .select()
          .from(schema.workspaces)
          .where(inArray(schema.workspaces.id, workspaceIds))
      : [];
    const mapped = await withBudgets(rows);
    const data = await Promise.all(
      mapped.map(async (workspace) => ({
        ...workspace,
        can_manage: await canManageWorkspace(auth, workspace.id),
      })),
    );
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if (auth.workspaceId) {
      return jsonError(Object.assign(new Error("workspace-scoped keys cannot create tenants"), { status: 403 }));
    }
    const body = await req.json();
    const organizationId = body.organization_id ? String(body.organization_id) : null;
    if (organizationId && !(await canManageOrganization(auth, organizationId))) {
      return jsonError(Object.assign(new Error("organization not found"), { status: 404 }));
    }
    let effectivePlan = auth.plan;
    if (organizationId) {
      const [owner] = await db
        .select({ plan: schema.users.plan })
        .from(schema.organizations)
        .innerJoin(schema.users, eq(schema.users.id, schema.organizations.ownerId))
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);
      if (owner?.plan !== "team") {
        return jsonError(
          Object.assign(new Error("Team plan required for organization workspaces"), {
            status: 403,
            code: "plan_required",
          }),
        );
      }
      effectivePlan = owner.plan;
    }
    const maxWorkspaces = limitsForPlan(effectivePlan).workspaces;
    const [existingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.workspaces)
      .where(
        organizationId
          ? eq(schema.workspaces.organizationId, organizationId)
          : and(eq(schema.workspaces.userId, auth.userId), isNull(schema.workspaces.organizationId)),
      );
    if (Number(existingCount?.count ?? 0) >= maxWorkspaces) {
      return jsonError(
        Object.assign(new Error(`Plan limit reached (${maxWorkspaces} workspaces)`), {
          status: 403,
          code: "plan_limit",
        }),
      );
    }
    const row = {
      id: id("ws"),
      userId: auth.userId,
      organizationId,
      name: body.name ?? "Workspace",
      slug: slugify(String(body.slug ?? body.name ?? "workspace"), "workspace"),
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
    return Response.json({ data: { ...(mapped ?? row), can_manage: true } });
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
    if (!ws || !(await canManageWorkspace(auth, workspaceId))) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    if (typeof body.name === "string") {
      await db.update(schema.workspaces).set({ name: body.name }).where(eq(schema.workspaces.id, workspaceId));
    }
    if (typeof body.include_byok_in_budgets === "boolean") {
      await db
        .update(schema.workspaces)
        .set({ includeByokInBudgets: body.include_byok_in_budgets })
        .where(eq(schema.workspaces.id, workspaceId));
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

export async function DELETE(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const workspaceId = new URL(req.url).searchParams.get("id");
    if (!workspaceId) return jsonError(Object.assign(new Error("id required"), { status: 400 }));
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    if (!ws || !(await canManageWorkspace(auth, workspaceId))) {
      return jsonError(Object.assign(new Error("not found"), { status: 404 }));
    }
    if (ws.isDefault) {
      return jsonError(Object.assign(new Error("cannot delete default workspace"), { status: 400 }));
    }
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
    return Response.json({ data: { success: true } });
  } catch (error) {
    return jsonError(error);
  }
}
