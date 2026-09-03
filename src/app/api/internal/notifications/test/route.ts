import { getSession } from "@/lib/auth";
import { APP_NAME, APP_URL } from "@/lib/config";
import { sendMail } from "@/lib/email";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/** Send a one-shot test email to the signed-in user (uses same mail path as alerts). */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user?.email) return Response.json({ error: "No email on account" }, { status: 400 });

  try {
    await sendMail({
      to: user.email,
      subject: `Test · ${APP_NAME} notifications`,
      text: [
        `Hola ${user.name || "ahí"},`,
        "",
        `Este es un mail de prueba desde ${APP_NAME}.`,
        `Si llegó, el canal de email de esta instancia está cableado.`,
        `Sin RESEND_API_KEY el mensaje queda en logs del servidor.`,
        "",
        `Preferencias: ${APP_URL}/settings/notifications`,
        `Webhooks: ${APP_URL}/settings/observability`,
      ].join("\n"),
    });
    return Response.json({
      ok: true,
      to: user.email,
      note: process.env.RESEND_API_KEY?.trim()
        ? "Enviado vía Resend"
        : "Sin RESEND_API_KEY — revisá logs del servidor",
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "send failed" },
      { status: 502 },
    );
  }
}
