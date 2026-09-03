import { and, eq, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { issueApiKey } from "@/lib/keys";

/** One-time reveal: solo si hay Default sin uso; evita rotar dos veces. */
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

  if (!unused) {
    return Response.json(
      {
        error:
          "No hay key de bienvenida pendiente. Usá Rotar en API Keys si necesitás el plaintext de nuevo.",
      },
      { status: 409 },
    );
  }

  const [ws] = await db
    .select()
    .from(schema.workspaces)
    .where(and(eq(schema.workspaces.userId, userId), eq(schema.workspaces.isDefault, true)))
    .limit(1);

  // Marca la vieja como usada antes de borrar para ganar races de doble POST
  const [fresh] = await db
    .select({ id: schema.apiKeys.id, lastUsedAt: schema.apiKeys.lastUsedAt })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.id, unused.id), isNull(schema.apiKeys.lastUsedAt)))
    .limit(1);
  if (!fresh) {
    return Response.json(
      { error: "La key de bienvenida ya fue revelada. Usá Rotar si necesitás otra." },
      { status: 409 },
    );
  }
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date(), disabled: true })
    .where(and(eq(schema.apiKeys.id, unused.id), isNull(schema.apiKeys.lastUsedAt)));

  const [still] = await db
    .select({ id: schema.apiKeys.id, disabled: schema.apiKeys.disabled })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.id, unused.id))
    .limit(1);
  if (!still?.disabled) {
    return Response.json(
      { error: "La key de bienvenida ya fue revelada. Usá Rotar si necesitás otra." },
      { status: 409 },
    );
  }

  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, unused.id));

  const issued = await issueApiKey({
    userId,
    name: "Default",
    workspaceId: unused.workspaceId ?? ws?.id ?? null,
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
      curl: `curl $NEXUS_URL/api/v1/chat/completions -H "Authorization: Bearer ${issued.key}" -H "Content-Type: application/json" -d '{"model":"nexus/auto","messages":[{"role":"user","content":"Hola"}]}'`,
    },
  });
}
