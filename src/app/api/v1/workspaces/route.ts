import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema, withTransaction } from "@/lib/db";
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

async function withMembers<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return [];
  const members = await db
    .select({
      workspaceId: schema.workspaceMembers.workspaceId,
      userId: schema.workspaceMembers.userId,
    })
    .from(schema.workspaceMembers)
    .where(
      inArray(
        schema.workspaceMembers.workspaceId,
        rows.map((row) => row.id),
      ),
    );
  const byWorkspace = new Map<string, string[]>();
  for (const member of members) {
    byWorkspace.set(member.workspaceId, [
      ...(byWorkspace.get(member.workspaceId) ?? []),
      member.userId,
    ]);
  }
  return rows.map((row) => ({ ...row, member_ids: byWorkspace.get(row.id) ?? [] }));
}

async function organizationMemberIds(organizationId: string) {
  return db
    .select({ userId: schema.organizationMembers.userId })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.organizationId, organizationId));
}

async function validateMemberIds(organizationId: string, requested: unknown) {
  if (!Array.isArray(requested) || requested.length > 500) {
    throw Object.assign(new Error("member_ids must be an array with at most 500 entries"), {
      status: 400,
      code: "invalid_request",
    });
  }
  const wanted = [...new Set(requested.map(String).filter(Boolean))];
  const available = new Set(
    (await organizationMemberIds(organizationId)).map((member) => member.userId),
  );
  if (wanted.some((userId) => !available.has(userId))) {
    throw Object.assign(new Error("Every workspace member must belong to the organization"), {
      status: 400,
      code: "invalid_request",
    });
  }
  return wanted;
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
    const mapped = await withMembers(await withBudgets(rows));
    const data = await Promise.all(
      mapped.map(async (workspace) => {
        const canManage = await canManageWorkspace(auth, workspace.id);
        return {
          ...workspace,
          member_ids: canManage
            ? workspace.member_ids
            : workspace.member_ids.filter((userId) => userId === auth.userId),
          can_manage: canManage,
        };
      }),
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
    let workspaceOwnerId = auth.userId;
    if (organizationId) {
      const [owner] = await db
        .select({ id: schema.users.id, plan: schema.users.plan })
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
      workspaceOwnerId = owner.id;
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
    const isOrganizationDefault = Boolean(
      organizationId && Number(existingCount?.count ?? 0) === 0,
    );
    const row = {
      id: id("ws"),
      userId: workspaceOwnerId,
      organizationId,
      name: body.name ?? "Workspace",
      slug: slugify(String(body.slug ?? body.name ?? "workspace"), "workspace"),
      isDefault: isOrganizationDefault,
    };
    const memberIds = organizationId
      ? isOrganizationDefault
        ? (await organizationMemberIds(organizationId)).map((member) => member.userId)
        : await validateMemberIds(organizationId, body.member_ids ?? [])
      : [];
    await withTransaction(async (tx) => {
      await tx.insert(schema.workspaces).values(row);
      if (body.limit != null) {
        await tx.insert(schema.workspaceBudgets).values({
          id: id("wbud"),
          workspaceId: row.id,
          interval: body.interval ?? "monthly",
          limitMicros: usdToMicros(Number(body.limit)),
        });
      }
      if (memberIds.length) {
        await tx.insert(schema.workspaceMembers).values(
          memberIds.map((userId) => ({ id: id("wsm"), workspaceId: row.id, userId })),
        );
      }
    });
    const [created] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, row.id)).limit(1);
    const [mapped] = await withMembers(await withBudgets(created ? [created] : []));
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
    let memberIds: string[] | null = null;
    if (body.member_ids !== undefined) {
      if (!ws.organizationId) {
        return jsonError(
          Object.assign(new Error("Personal workspaces do not have organization members"), {
            status: 400,
            code: "invalid_request",
          }),
        );
      }
      if (ws.isDefault) {
        return jsonError(
          Object.assign(new Error("The default organization workspace includes every member"), {
            status: 400,
            code: "invalid_request",
          }),
        );
      }
      memberIds = await validateMemberIds(ws.organizationId, body.member_ids);
    }
    await withTransaction(async (tx) => {
      if (typeof body.name === "string") {
        await tx
          .update(schema.workspaces)
          .set({ name: body.name })
          .where(eq(schema.workspaces.id, workspaceId));
      }
      if (typeof body.include_byok_in_budgets === "boolean") {
        await tx
          .update(schema.workspaces)
          .set({ includeByokInBudgets: body.include_byok_in_budgets })
          .where(eq(schema.workspaces.id, workspaceId));
      }
      if (memberIds) {
        await tx
          .delete(schema.workspaceMembers)
          .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
        if (memberIds.length) {
          await tx.insert(schema.workspaceMembers).values(
            memberIds.map((userId) => ({ id: id("wsm"), workspaceId, userId })),
          );
        }
      }
      if (body.limit != null) {
        const [existing] = await tx
          .select()
          .from(schema.workspaceBudgets)
          .where(eq(schema.workspaceBudgets.workspaceId, workspaceId))
          .limit(1);
        if (existing) {
          await tx
            .update(schema.workspaceBudgets)
            .set({
              limitMicros: usdToMicros(Number(body.limit)),
              interval: body.interval ?? existing.interval,
            })
            .where(eq(schema.workspaceBudgets.id, existing.id));
        } else {
          await tx.insert(schema.workspaceBudgets).values({
            id: id("wbud"),
            workspaceId,
            interval: body.interval ?? "monthly",
            limitMicros: usdToMicros(Number(body.limit)),
          });
        }
      }
    });
    const [fresh] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1);
    const [mapped] = await withMembers(await withBudgets(fresh ? [fresh] : []));
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
