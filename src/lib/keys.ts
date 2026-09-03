import { MANAGEMENT_KEY_PREFIX, KEY_PREFIX } from "@/lib/config";
import { randomKey, sha256 } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { defaultScopes } from "@/lib/gateway/acl";

export async function issueApiKey(opts: {
  userId: string;
  name: string;
  workspaceId?: string | null;
  isManagement?: boolean;
  limitMicros?: number | null;
  limitReset?: string | null;
  includeByokInLimit?: boolean;
  scopes?: string[];
}) {
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
    limitMicros: opts.limitMicros ?? null,
    limitReset: opts.limitReset ?? null,
    includeByokInLimit: Boolean(opts.includeByokInLimit),
  };
  await db.insert(schema.apiKeys).values(row);
  return { ...row, key: plain };
}
