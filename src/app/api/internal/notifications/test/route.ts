import { getSession } from "@/lib/auth";
import { APP_NAME, APP_URL } from "@/lib/config";
import { emailDeliveryConfigured, sendMail } from "@/lib/email";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";

/** Send a one-shot test email to the signed-in user (uses same mail path as alerts). */
export async function POST() {
  const session = await getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailDeliveryConfigured()) {
    return Response.json(
      {
        error: {
          message: "El canal de correo todavía no está disponible.",
          code: "email_unavailable",
        },
      },
      { status: 503 },
    );
  }
  const limited = await enforceControlPlaneOperationRateLimit(
    session.user.id,
    "notification_test",
  );
  if (limited) return limited;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user?.email)
    return Response.json({ error: "No email on account" }, { status: 400 });

  try {
    const delivery = await sendMail({
      to: user.email,
      subject: `Test · ${APP_NAME} notifications`,
      text: [
        `Hola ${user.name || "ahí"},`,
        "",
        `Este es un mail de prueba desde ${APP_NAME}.`,
        `Si llegó, el canal de email de esta instancia está cableado.`,
        `Este mensaje confirma que el canal de avisos está funcionando.`,
        "",
        `Preferencias: ${APP_URL}/settings/notifications`,
        `Webhooks: ${APP_URL}/settings/observability`,
      ].join("\n"),
    });
    if (!delivery.ok) {
      return Response.json(
        {
          error: {
            message:
              "El correo no pudo ser entregado. Intentá nuevamente más tarde.",
            code: "email_delivery_failed",
          },
        },
        { status: 502 },
      );
    }
    return Response.json({
      data: { sent: true },
    });
  } catch (err) {
    console.error("Notification test email failed", {
      userId: session.user.id,
      error: err instanceof Error ? err.message : "unknown",
    });
    return Response.json(
      {
        error: {
          message:
            "El correo no pudo ser entregado. Intentá nuevamente más tarde.",
          code: "email_delivery_failed",
        },
      },
      { status: 502 },
    );
  }
}
