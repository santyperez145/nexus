import { eq, sql } from "drizzle-orm";
import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";
import { getStripe } from "@/lib/stripe";

async function creditPurchase(opts: {
  userId: string;
  creditsUsd: number;
  stripeSessionId?: string;
  note: string;
  customerId?: string | null;
}) {
  const micros = usdToMicros(opts.creditsUsd);
  await db
    .update(schema.users)
    .set({
      creditMicros: sql`${schema.users.creditMicros} + ${micros}`,
      ...(opts.customerId ? { stripeCustomerId: opts.customerId } : {}),
    })
    .where(eq(schema.users.id, opts.userId));
  await db.insert(schema.creditLedger).values({
    id: id("led"),
    userId: opts.userId,
    type: "purchase",
    micros,
    stripeSessionId: opts.stripeSessionId,
    note: opts.note,
  });
}

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }
  await ensureDb();
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return Response.json({ error: "Missing signature" }, { status: 400 });
  const event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const creditsUsd = Number(session.metadata?.creditsUsd ?? 0);
    if (userId && creditsUsd > 0) {
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer && "id" in session.customer
            ? session.customer.id
            : undefined;
      await creditPurchase({
        userId,
        creditsUsd,
        stripeSessionId: session.id,
        customerId,
        note: `Compra Stripe ${creditsUsd} USD (fee ${(CREDIT_PURCHASE_FEE * 100).toFixed(1)}% en el cargo)`,
      });
    }
  }

  return Response.json({ received: true });
}
