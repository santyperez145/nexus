import type Stripe from "stripe";
import { processStripeEventOnce } from "@/lib/billing/stripe-event-processor";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return Response.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await processStripeEventOnce(stripe, event);
    if (outcome === "already_processed") {
      return Response.json({ received: true, duplicate: true, state: outcome });
    }
    if (outcome === "already_processing") {
      return Response.json(
        { received: false, retry: true, state: outcome },
        { status: 409 },
      );
    }
    return Response.json({ received: true, state: outcome });
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
