import { eq } from "drizzle-orm";
import { APP_NAME, APP_URL } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { formatUsd, microsToUsd } from "@/lib/money";

/** Fire-and-forget: email if saldo cayó bajo el umbral configurado. */
export async function maybeNotifyLowBalance(userId: string, creditMicros: number) {
  try {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user?.notifyLowBalance) return;
    const threshold = Number(user.lowBalanceThresholdUsd ?? 5);
    if (!(threshold > 0)) return;
    const remaining = microsToUsd(creditMicros);
    if (remaining >= threshold) return;
    await sendMail({
      to: user.email,
      subject: `Saldo bajo · ${APP_NAME}`,
      text: [
        `Hola ${user.name || "ahí"},`,
        "",
        `Tu saldo en ${APP_NAME} está en ${formatUsd(remaining, 4)} (umbral ${formatUsd(threshold, 2)}).`,
        `Cargá créditos: ${APP_URL}/settings/credits`,
        "",
        `Desactivá estas alertas en ${APP_URL}/settings/notifications`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[nexus-notify] low balance", err);
  }
}

export async function maybeNotifyKeyLimit(opts: {
  userId: string;
  keyName: string;
  usage: number;
  limit: number;
}) {
  try {
    if (opts.limit <= 0) return;
    const pct = opts.usage / opts.limit;
    if (pct < 0.9) return;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, opts.userId)).limit(1);
    if (!user?.notifyKeyLimit) return;
    await sendMail({
      to: user.email,
      subject: `Key cerca del límite · ${APP_NAME}`,
      text: [
        `Hola ${user.name || "ahí"},`,
        "",
        `La key "${opts.keyName}" usó ${(pct * 100).toFixed(0)}% de su límite (${formatUsd(opts.usage, 4)} / ${formatUsd(opts.limit, 2)}).`,
        `Gestioná keys: ${APP_URL}/settings/keys`,
        "",
        `Preferencias: ${APP_URL}/settings/notifications`,
      ].join("\n"),
    });
  } catch (err) {
    console.error("[nexus-notify] key limit", err);
  }
}
