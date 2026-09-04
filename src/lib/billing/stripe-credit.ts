import { eq, sql } from "drizzle-orm";
import { creditPurchaseFeeUsd } from "@/lib/config";
import { schema, withTransaction } from "@/lib/db";
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
  const micros = usdToMicros(opts.creditsUsd);
  const note =
    opts.note ??
    `Compra Stripe ${opts.creditsUsd} USD (fee ${creditPurchaseFeeUsd(opts.creditsUsd).toFixed(2)} USD en el cargo)`;
  return withTransaction(async (tx) => {
    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        id: id("led"),
        userId: opts.userId,
        type: "purchase",
        micros,
        stripeSessionId: opts.stripeSessionId,
        note,
      })
      .onConflictDoNothing({ target: schema.creditLedger.stripeSessionId })
      .returning();
    if (!inserted.length) return { credited: false, micros: 0 };

    const updated = await tx
      .update(schema.users)
      .set({
        creditMicros: sql`${schema.users.creditMicros} + ${micros}`,
        ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
      })
      .where(eq(schema.users.id, opts.userId))
      .returning();
    if (!updated.length) throw new Error("Stripe purchase user not found");

    return { credited: true, micros };
  });
}
