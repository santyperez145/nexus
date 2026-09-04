import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { processStripeEventOnce } from "@/lib/billing/stripe-event-processor";
import { isPlatformAdmin } from "@/lib/config";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { getStripe } from "@/lib/stripe";

const EVENT_ID = /^evt_[A-Za-z0-9]+$/;

async function insertReplayAudit(input: {
  actorId: string;
  actorEmail: string;
  eventId: string;
  outcome: string;
}) {
  await db.insert(schema.auditLogs).values({
    id: id("aud"),
    userId: input.actorId,
    action: "platform.stripe_event_replay",
    resource: "stripe_webhook_event",
    resourceId: input.eventId,
    meta: { actorEmail: input.actorEmail, outcome: input.outcome },
  });
}

async function writeReplayOutcomeAudit(input: {
  actorId: string;
  actorEmail: string;
  eventId: string;
  outcome: string;
}) {
  try {
    await insertReplayAudit(input);
  } catch (error) {
    console.error("Stripe replay audit could not be persisted", {
      eventId: input.eventId,
      actorId: input.actorId,
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformAdmin(session.user.email)) {
    return Response.json({ error: "Platform admin required" }, { status: 403 });
  }

  const eventId = (await params).id;
  if (!EVENT_ID.test(eventId) || eventId.length > 255) {
    return Response.json({ error: "Invalid Stripe event ID" }, { status: 400 });
  }
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "Stripe not configured" }, { status: 503 });

  try {
    await ensureDb();
    const [stored] = await db
      .select({ eventType: schema.stripeWebhookEvents.eventType })
      .from(schema.stripeWebhookEvents)
      .where(eq(schema.stripeWebhookEvents.id, eventId))
      .limit(1);
    if (!stored) return Response.json({ error: "Stripe inbox event not found" }, { status: 404 });
    await insertReplayAudit({
      actorId: session.user.id,
      actorEmail: session.user.email,
      eventId,
      outcome: "requested",
    });
    const event = await stripe.events.retrieve(eventId);
    if (event.type !== stored.eventType) {
      await writeReplayOutcomeAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        eventId,
        outcome: "type_mismatch",
      });
      return Response.json({ error: "Canonical Stripe event type mismatch" }, { status: 409 });
    }
    const outcome = await processStripeEventOnce(stripe, event);
    await writeReplayOutcomeAudit({
      actorId: session.user.id,
      actorEmail: session.user.email,
      eventId,
      outcome,
    });
    if (outcome === "already_processing") {
      return Response.json({ error: "Stripe event is already processing" }, { status: 409 });
    }
    return Response.json({ data: { event_id: eventId, outcome } });
  } catch (error) {
    await writeReplayOutcomeAudit({
      actorId: session.user.id,
      actorEmail: session.user.email,
      eventId,
      outcome: "failed",
    });
    console.error("Stripe event replay failed", {
      eventId,
      actorId: session.user.id,
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "Stripe event replay failed" }, { status: 502 });
  }
}
