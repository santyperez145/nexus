import { and, eq, sql } from "drizzle-orm";
import { schema, type DbExecutor } from "@/lib/db";
import { id } from "@/lib/ids";
import { assertWorkspaceManager } from "@/lib/gateway/tenant";
import type { AuthContext } from "@/lib/gateway/types";
import { hubTenantAccess } from "./datasets";

function conflict(message: string) {
  return Object.assign(new Error(message), { status: 409, code: "conflict" });
}

/**
 * Claim or resolve the single Hub namespace owned by a personal account or workspace.
 * Datasets and Spaces deliberately share this identity boundary.
 */
export async function ownedHubNamespace(
  tx: DbExecutor,
  auth: AuthContext,
  namespaceSlug: string,
  displayName: string,
  workspaceId: string | null,
) {
  const [existing] = await tx
    .select()
    .from(schema.hubNamespaces)
    .where(eq(schema.hubNamespaces.slug, namespaceSlug))
    .limit(1);
  if (existing) {
    const sameScope = workspaceId
      ? existing.workspaceId === workspaceId
      : existing.workspaceId == null && existing.userId === auth.userId;
    if (!sameScope || !hubTenantAccess(auth, existing)) throw conflict("namespace is already claimed");
    return existing;
  }

  const ownerWhere = workspaceId
    ? eq(schema.hubNamespaces.workspaceId, workspaceId)
    : and(eq(schema.hubNamespaces.userId, auth.userId), sql`${schema.hubNamespaces.workspaceId} IS NULL`);
  const [ownerNamespace] = await tx.select().from(schema.hubNamespaces).where(ownerWhere).limit(1);
  if (ownerNamespace) {
    throw conflict(`this tenant already uses namespace ${ownerNamespace.slug}`);
  }
  await assertWorkspaceManager(auth, workspaceId, tx);
  const row = {
    id: id("ns"),
    slug: namespaceSlug,
    displayName,
    userId: auth.userId,
    workspaceId,
    verified: false,
  };
  await tx.insert(schema.hubNamespaces).values(row);
  return { ...row, createdAt: new Date() };
}
