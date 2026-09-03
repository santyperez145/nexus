import { CREDIT_PURCHASE_FEE } from "@/lib/config";
import { creditPurchaseOnce } from "@/lib/billing/stripe-credit";
import { ensureDb } from "@/lib/db";
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
    if (userId && creditsUsd > 0 && session.id) {
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer && "id" in session.customer
            ? session.customer.id
            : undefined;
      await creditPurchaseOnce({
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
