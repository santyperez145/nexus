import { and, eq, lte, or, sql } from "drizzle-orm";
import { db, schema, withTransaction } from "@/lib/db";

const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 2_000;

export type StripeWebhookClaim = "claimed" | "already_processing" | "already_processed";

export async function claimStripeWebhookEvent(input: {
  id: string;
  eventType: string;
  stripeCreatedAt: Date;
  now?: Date;
}): Promise<StripeWebhookClaim> {
  const now = input.now ?? new Date();
  return withTransaction(async (tx) => {
    const inserted = await tx
      .insert(schema.stripeWebhookEvents)
      .values({
        id: input.id,
        eventType: input.eventType,
        status: "processing",
        attempts: 1,
        stripeCreatedAt: input.stripeCreatedAt,
        receivedAt: now,
        lastAttemptAt: now,
      })
      .onConflictDoNothing({ target: schema.stripeWebhookEvents.id })
      .returning();
    if (inserted.length) return "claimed";

    const [existing] = await tx
      .select({ status: schema.stripeWebhookEvents.status })
      .from(schema.stripeWebhookEvents)
      .where(eq(schema.stripeWebhookEvents.id, input.id))
      .limit(1);
    if (existing?.status === "processed") return "already_processed";

    const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
    const reclaimed = await tx
      .update(schema.stripeWebhookEvents)
      .set({
        status: "processing",
        attempts: sql`${schema.stripeWebhookEvents.attempts} + 1`,
        lastAttemptAt: now,
        lastError: null,
      })
      .where(
        and(
          eq(schema.stripeWebhookEvents.id, input.id),
          or(
            eq(schema.stripeWebhookEvents.status, "failed"),
            and(
              eq(schema.stripeWebhookEvents.status, "processing"),
              lte(schema.stripeWebhookEvents.lastAttemptAt, staleBefore),
            ),
          ),
        ),
      )
      .returning();
    return reclaimed.length ? "claimed" : "already_processing";
  });
}

export async function markStripeWebhookProcessed(eventId: string, now = new Date()) {
  await db
    .update(schema.stripeWebhookEvents)
    .set({ status: "processed", processedAt: now, lastError: null })
    .where(eq(schema.stripeWebhookEvents.id, eventId));
}

export async function markStripeWebhookFailed(eventId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown");
  await db
    .update(schema.stripeWebhookEvents)
    .set({ status: "failed", lastError: message.slice(0, MAX_ERROR_LENGTH) })
    .where(eq(schema.stripeWebhookEvents.id, eventId));
}
