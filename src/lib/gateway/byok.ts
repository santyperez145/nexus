import { and, eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";

/** BYOK activo del usuario para un adapter (p. ej. openai). */
export async function resolveByokKey(userId: string, provider: string) {
  const rows = await db
    .select()
    .from(schema.byokCredentials)
    .where(and(eq(schema.byokCredentials.userId, userId), eq(schema.byokCredentials.deleted, false)));
  const match = rows.find((c) => c.provider === provider);
  if (!match) return undefined;
  return decryptSecret(match.encryptedKey);
}
