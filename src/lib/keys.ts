import { MANAGEMENT_KEY_PREFIX, KEY_PREFIX } from "@/lib/config";
import { randomKey, sha256 } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";

export async function issueApiKey(opts: {
  userId: string;
  name: string;
  workspaceId?: string | null;
  isManagement?: boolean;
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
  };
  await db.insert(schema.apiKeys).values(row);
  return { ...row, key: plain };
}
