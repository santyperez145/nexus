import { and, eq, inArray, or, type Column, type SQL } from "drizzle-orm";
import type { AuthContext } from "./types";
import { db, schema, type DbExecutor } from "@/lib/db";

/** Exact for workspace-scoped keys; sessions see owned rows plus explicitly accessible workspaces. */
export function canAccess(
  auth: Pick<AuthContext, "userId" | "workspaceId" | "workspaceIds">,
  row: { userId: string; workspaceId?: string | null },
) {
  if (auth.workspaceId) {
    return (
      row.workspaceId === auth.workspaceId &&
      (auth.workspaceIds ?? [auth.workspaceId]).includes(auth.workspaceId)
    );
  }
  if (row.userId === auth.userId) return true;
  return Boolean(row.workspaceId && auth.workspaceIds?.includes(row.workspaceId));
}

export function userScope(
  auth: AuthContext,
  userCol: Column,
  workspaceCol?: Column,
): SQL | undefined {
  if (auth.workspaceId && workspaceCol) {
    return eq(workspaceCol, auth.workspaceId);
  }
  if (workspaceCol && auth.workspaceIds?.length) {
    return or(eq(userCol, auth.userId), inArray(workspaceCol, auth.workspaceIds));
  }
  return eq(userCol, auth.userId);
}

export async function accessibleWorkspaceIds(userId: string) {
  const owned = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, userId));
  const memberships = await db
    .select({
      organizationId: schema.organizationMembers.organizationId,
      role: schema.organizationMembers.role,
    })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.userId, userId));
  const ownedOrganizations = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.ownerId, userId));
  const managedOrganizationIds = [
    ...ownedOrganizations.map((organization) => organization.id),
    ...memberships
      .filter((membership) => membership.role === "owner" || membership.role === "admin")
      .map((membership) => membership.organizationId),
  ];
  const managed = managedOrganizationIds.length
    ? await db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(inArray(schema.workspaces.organizationId, managedOrganizationIds))
    : [];
  const assigned = await db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaceMembers)
    .innerJoin(
      schema.workspaces,
      eq(schema.workspaces.id, schema.workspaceMembers.workspaceId),
    )
    .innerJoin(
      schema.organizationMembers,
      and(
        eq(schema.organizationMembers.organizationId, schema.workspaces.organizationId),
        eq(schema.organizationMembers.userId, schema.workspaceMembers.userId),
      ),
    )
    .where(eq(schema.workspaceMembers.userId, userId));
  return [...new Set([...owned, ...managed, ...assigned].map((workspace) => workspace.id))];
}

export async function canManageWorkspace(
  auth: AuthContext,
  workspaceId: string,
  executor: DbExecutor = db,
) {
  const [workspace] = await executor
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return false;
  if (workspace.userId === auth.userId) return true;
  if (!workspace.organizationId) return false;
  return canManageOrganization(auth, workspace.organizationId, executor);
}

export async function canManageOrganization(
  auth: AuthContext,
  organizationId: string,
  executor: DbExecutor = db,
) {
  const [organization] = await executor
    .select({ ownerId: schema.organizations.ownerId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!organization) return false;
  if (organization.ownerId === auth.userId) return true;
  const [membership] = await executor
    .select({ role: schema.organizationMembers.role })
    .from(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.organizationId, organizationId),
        eq(schema.organizationMembers.userId, auth.userId),
      ),
    )
    .limit(1);
  return membership?.role === "owner" || membership?.role === "admin";
}

export async function assertWorkspaceManager(
  auth: AuthContext,
  workspaceId?: string | null,
  executor: DbExecutor = db,
) {
  if (!workspaceId) return;
  if (!(await canManageWorkspace(auth, workspaceId, executor))) {
    throw Object.assign(new Error("Workspace admin role required"), {
      status: 403,
      code: "forbidden",
    });
  }
}

export async function canMutateResource(
  auth: AuthContext,
  row: { userId: string; workspaceId?: string | null },
) {
  if (row.userId === auth.userId && (!auth.workspaceId || row.workspaceId === auth.workspaceId)) {
    return true;
  }
  return Boolean(row.workspaceId && (await canManageWorkspace(auth, row.workspaceId)));
}

export async function resolveOwnedWorkspace(auth: AuthContext, requested: unknown) {
  const workspaceId = requested == null || requested === "" ? auth.workspaceId ?? null : String(requested);
  if (!workspaceId) return null;
  if (auth.workspaceId && workspaceId !== auth.workspaceId) {
    throw Object.assign(new Error("Workspace not found"), { status: 404, code: "not_found" });
  }
  const accessible = auth.workspaceIds ?? (await accessibleWorkspaceIds(auth.userId));
  if (!accessible.includes(workspaceId)) {
    throw Object.assign(new Error("Workspace not found"), { status: 404, code: "not_found" });
  }
  return workspaceId;
}
