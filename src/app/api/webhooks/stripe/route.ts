import { eq, sql } from "drizzle-orm";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";
import { getStripe } from "@/lib/stripe";

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
      const micros = usdToMicros(creditsUsd);
      await db
        .update(schema.users)
        .set({ creditMicros: sql`${schema.users.creditMicros} + ${micros}` })
        .where(eq(schema.users.id, userId));
      await db.insert(schema.creditLedger).values({
        id: id("led"),
        userId,
        type: "purchase",
        micros,
        stripeSessionId: session.id,
        note: `Compra Stripe ${creditsUsd} USD`,
      });
    }
  }
  return Response.json({ received: true });
}
