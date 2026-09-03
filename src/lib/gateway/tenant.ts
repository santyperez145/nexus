import { and, eq, inArray, or, type Column, type SQL } from "drizzle-orm";
import type { AuthContext } from "./types";
import { db, schema } from "@/lib/db";

/** Key/workspace scoped row access. Session without workspace sees the whole user. */
export function canAccess(
  auth: AuthContext,
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
    .select({ organizationId: schema.organizationMembers.organizationId })
    .from(schema.organizationMembers)
    .where(eq(schema.organizationMembers.userId, userId));
  const organizationIds = memberships.map((membership) => membership.organizationId);
  const shared = organizationIds.length
    ? await db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(inArray(schema.workspaces.organizationId, organizationIds))
    : [];
  return [...new Set([...owned, ...shared].map((workspace) => workspace.id))];
}

export async function canManageWorkspace(auth: AuthContext, workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return false;
  if (workspace.userId === auth.userId) return true;
  if (!workspace.organizationId) return false;
  return canManageOrganization(auth, workspace.organizationId);
}

export async function canManageOrganization(auth: AuthContext, organizationId: string) {
  const [organization] = await db
    .select({ ownerId: schema.organizations.ownerId })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  if (!organization) return false;
  if (organization.ownerId === auth.userId) return true;
  const [membership] = await db
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

export async function assertWorkspaceManager(auth: AuthContext, workspaceId?: string | null) {
  if (!workspaceId) return;
  if (!(await canManageWorkspace(auth, workspaceId))) {
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
