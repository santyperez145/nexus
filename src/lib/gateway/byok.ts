import { and, eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { canAccess, userScope } from "./tenant";
import type { AuthContext } from "./types";

/** BYOK activo del usuario (y workspace de la key, si aplica). */
export async function resolveByokKey(userId: string, provider: string, auth?: AuthContext) {
  const rows = await db
    .select()
    .from(schema.byokCredentials)
    .where(
      and(
        auth
          ? userScope(auth, schema.byokCredentials.userId, schema.byokCredentials.workspaceId)
          : eq(schema.byokCredentials.userId, userId),
        eq(schema.byokCredentials.deleted, false),
      ),
    );
  const match = rows.find(
    (c) => c.provider === provider && (!auth || canAccess(auth, c)),
  );
  if (!match) return undefined;
  return decryptSecret(match.encryptedKey);
}
