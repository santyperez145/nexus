import { getSession } from "@/lib/auth";
import { signupBonusMicros } from "@/lib/config";
import { ensureDb } from "@/lib/db";
import { claimWelcomeApiKey, provisionUserAccount } from "@/lib/onboarding/provision";

/** One-time reveal: solo si hay Default sin uso; evita rotar dos veces. */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDb();
  const userId = session.user.id;
  await provisionUserAccount(userId, signupBonusMicros());
  const issued = await claimWelcomeApiKey(userId);
  if (!issued) {
    return Response.json(
      {
        error:
          "No hay key de bienvenida pendiente. Usá Rotar en API Keys si necesitás el plaintext de nuevo.",
      },
      { status: 409 },
    );
  }

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
