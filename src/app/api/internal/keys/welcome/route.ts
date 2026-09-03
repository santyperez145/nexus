import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { issueApiKey } from "@/lib/keys";

/** One-time reveal: rota la key Default sin uso y devuelve plaintext. */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDb();
  const userId = session.user.id;
  const [unused] = await db
    .select()
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.userId, userId),
        eq(schema.apiKeys.name, "Default"),
        isNull(schema.apiKeys.lastUsedAt),
        eq(schema.apiKeys.disabled, false),
      ),
    )
    .limit(1);

  const [ws] = await db
    .select()
    .from(schema.workspaces)
    .where(and(eq(schema.workspaces.userId, userId), eq(schema.workspaces.isDefault, true)))
    .limit(1);

  if (unused) {
    await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, unused.id));
  }

  const issued = await issueApiKey({
    userId,
    name: "Default",
    workspaceId: unused?.workspaceId ?? ws?.id ?? null,
  });

  return Response.json({
    data: {
      id: issued.id,
      key: issued.key,
      name: issued.name,
      prefix: issued.keyPrefix,
      workspace_id: issued.workspaceId,
      revealed: true,
      note: "Copiá la key ahora: no se vuelve a mostrar.",
    },
  });
}
