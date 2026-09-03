import { eq, sql } from "drizzle-orm";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";

/** Acredita compra Stripe una sola vez por session id. Inserta ledger y luego suma saldo. */
export async function creditPurchaseOnce(opts: {
  userId: string;
  creditsUsd: number;
  stripeSessionId: string;
  note?: string;
  customerId?: string | null;
}): Promise<{ credited: boolean; micros: number }> {
  const [existing] = await db
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.stripeSessionId, opts.stripeSessionId))
    .limit(1);
  if (existing) return { credited: false, micros: 0 };

  const micros = usdToMicros(opts.creditsUsd);
  const note =
    opts.note ??
    `Compra Stripe ${opts.creditsUsd} USD (fee ${(CREDIT_PURCHASE_FEE * 100).toFixed(1)}% en el cargo)`;
  const ledgerId = id("led");

  try {
    await db.insert(schema.creditLedger).values({
      id: ledgerId,
      userId: opts.userId,
      type: "purchase",
      micros,
      stripeSessionId: opts.stripeSessionId,
      note,
    });
  } catch {
    return { credited: false, micros: 0 };
  }

  try {
    await db
      .update(schema.users)
      .set({
        creditMicros: sql`${schema.users.creditMicros} + ${micros}`,
        ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
      })
      .where(eq(schema.users.id, opts.userId));
  } catch (error) {
    await db.delete(schema.creditLedger).where(eq(schema.creditLedger.id, ledgerId));
    throw error;
  }

  return { credited: true, micros };
}
