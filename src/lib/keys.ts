import { and, eq, sql } from "drizzle-orm";
import { MANAGEMENT_KEY_PREFIX, KEY_PREFIX } from "@/lib/config";
import { randomKey, sha256 } from "@/lib/crypto";
import { db, schema, withTransaction, type DbExecutor } from "@/lib/db";
import { id } from "@/lib/ids";
import { defaultScopes } from "@/lib/gateway/acl";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] })?.rows ?? []);
}

export async function lockUserForKeyMutation(tx: DbExecutor, userId: string) {
  const result = await tx.execute(sql`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`);
  if (!rowsOf(result).length) {
    throw Object.assign(new Error("Account not found"), { status: 404, code: "not_found" });
  }
}

export async function issueApiKey(opts: {
  userId: string;
  name: string;
  workspaceId?: string | null;
  isManagement?: boolean;
  limitMicros?: number | null;
  limitReset?: string | null;
  includeByokInLimit?: boolean;
  scopes?: string[];
  disabled?: boolean;
  pendingReveal?: boolean;
}, executor: DbExecutor = db) {
  const prefix = opts.isManagement ? MANAGEMENT_KEY_PREFIX : KEY_PREFIX;
  const plain = randomKey(prefix);
  const row = {
    id: id("key"),
    userId: opts.userId,
    workspaceId: opts.workspaceId ?? null,
    name: opts.name,
    keyHash: sha256(plain),
    keyPrefix: plain.slice(0, 12),
    isManagement: Boolean(opts.isManagement),
    scopes: opts.scopes ?? defaultScopes(Boolean(opts.isManagement)),
    disabled: Boolean(opts.disabled),
    pendingReveal: Boolean(opts.pendingReveal),
    limitMicros: opts.limitMicros ?? null,
    limitReset: opts.limitReset ?? null,
    includeByokInLimit: Boolean(opts.includeByokInLimit),
  };
  await executor.insert(schema.apiKeys).values(row);
  return { ...row, key: plain };
}

export async function createApiKeyWithinLimit(
  opts: Parameters<typeof issueApiKey>[0],
  maxKeys: number,
) {
  return withTransaction(async (tx) => {
    await lockUserForKeyMutation(tx, opts.userId);
    const [count] = await tx
      .select({ value: sql<number>`count(*)` })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, opts.userId));
    if (Number(count?.value ?? 0) >= maxKeys) {
      throw Object.assign(new Error(`Plan limit reached (${maxKeys} API keys)`), {
        status: 403,
        code: "plan_limit",
      });
    }
    return issueApiKey(opts, tx);
  });
}

export async function rotateApiKey(opts: {
  userId: string;
  keyId: string;
  workspaceId?: string | null;
}) {
  return withTransaction(async (tx) => {
    await lockUserForKeyMutation(tx, opts.userId);
    const [row] = await tx
      .select()
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.id, opts.keyId), eq(schema.apiKeys.userId, opts.userId)))
      .limit(1);
    if (!row || (opts.workspaceId && row.workspaceId !== opts.workspaceId)) {
      throw Object.assign(new Error("not found"), { status: 404, code: "not_found" });
    }
    const created = await issueApiKey(
      {
        userId: opts.userId,
        workspaceId: row.workspaceId,
        name: row.name,
        isManagement: row.isManagement,
        limitMicros: row.limitMicros,
        limitReset: row.limitReset,
        includeByokInLimit: row.includeByokInLimit,
        scopes: row.scopes ?? undefined,
      },
      tx,
    );
    await tx.delete(schema.apiKeys).where(eq(schema.apiKeys.id, row.id));
    return created;
  });
}
