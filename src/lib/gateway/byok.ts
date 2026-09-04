import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { id } from "@/lib/ids";
import { clientIp } from "@/lib/network/client-ip";
import { providerById } from "@/lib/providers/registry";
import type { AuthContext } from "./types";

export function isSupportedByokProvider(provider: string) {
  return provider === "fal" || Boolean(providerById(provider));
}

function scopeCondition(userId: string, workspaceId?: string | null) {
  return workspaceId
    ? eq(schema.byokCredentials.workspaceId, workspaceId)
    : and(
        eq(schema.byokCredentials.userId, userId),
        isNull(schema.byokCredentials.workspaceId),
      );
}

async function lockScope(tx: DbExecutor, userId: string, workspaceId?: string | null) {
  const target = workspaceId
    ? await tx.execute(sql`SELECT id FROM "workspace" WHERE id = ${workspaceId} FOR UPDATE`)
    : await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
  const rows = Array.isArray(target)
    ? target
    : ((target as { rows?: unknown[] })?.rows ?? []);
  if (!rows.length) {
    throw Object.assign(new Error(workspaceId ? "Workspace not found" : "Account not found"), {
      status: 404,
      code: "not_found",
    });
  }
}

/** Resolve exactly one scope: a personal request never inherits a shared secret. */
export async function resolveByokKey(userId: string, provider: string, auth?: AuthContext) {
  const workspaceId = auth?.workspaceId ?? null;
  if (
    workspaceId &&
    auth?.workspaceIds &&
    !auth.workspaceIds.includes(workspaceId)
  ) {
    return undefined;
  }
  const [match] = await db
    .select()
    .from(schema.byokCredentials)
    .where(
      and(
        scopeCondition(userId, workspaceId),
        eq(schema.byokCredentials.provider, provider),
        eq(schema.byokCredentials.deleted, false),
      ),
    )
    .orderBy(desc(schema.byokCredentials.createdAt), desc(schema.byokCredentials.id))
    .limit(1);
  if (!match) return undefined;
  return decryptSecret(match.encryptedKey);
}

export async function replaceByokCredential(input: {
  auth: AuthContext;
  workspaceId?: string | null;
  provider: string;
  key: string;
  label?: string | null;
  headers?: Headers;
}) {
  const workspaceId = input.workspaceId ?? null;
  return withTransaction(async (tx) => {
    await lockScope(tx, input.auth.userId, workspaceId);
    const previous = await tx
      .update(schema.byokCredentials)
      .set({ deleted: true, encryptedKey: "" })
      .where(
        and(
          scopeCondition(input.auth.userId, workspaceId),
          eq(schema.byokCredentials.provider, input.provider),
          eq(schema.byokCredentials.deleted, false),
        ),
      )
      .returning();
    const row = {
      id: id("byok"),
      userId: input.auth.userId,
      workspaceId,
      provider: input.provider,
      encryptedKey: encryptSecret(input.key),
      label: input.label ?? input.provider,
    };
    await tx.insert(schema.byokCredentials).values(row);
    await tx.insert(schema.auditLogs).values({
      id: id("aud"),
      userId: input.auth.userId,
      workspaceId,
      action: previous.length ? "byok.replace" : "byok.create",
      resource: "byok",
      resourceId: row.id,
      ip: clientIp(input.headers),
      meta: { provider: input.provider, replaced: previous.length > 0 },
    });
    return { row, replaced: previous.length > 0 };
  });
}

export async function removeByokCredential(input: {
  auth: AuthContext;
  credentialId: string;
  workspaceId?: string | null;
  headers?: Headers;
}) {
  const workspaceId = input.workspaceId ?? null;
  return withTransaction(async (tx) => {
    await lockScope(tx, input.auth.userId, workspaceId);
    const removed = await tx
      .update(schema.byokCredentials)
      .set({ deleted: true, encryptedKey: "" })
      .where(
        and(
          eq(schema.byokCredentials.id, input.credentialId),
          scopeCondition(input.auth.userId, workspaceId),
          eq(schema.byokCredentials.deleted, false),
        ),
      )
      .returning();
    if (!removed.length) return false;
    await tx.insert(schema.auditLogs).values({
      id: id("aud"),
      userId: input.auth.userId,
      workspaceId,
      action: "byok.delete",
      resource: "byok",
      resourceId: input.credentialId,
      ip: clientIp(input.headers),
    });
    return true;
  });
}
