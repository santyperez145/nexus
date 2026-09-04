import { createHmac, randomBytes } from "node:crypto";
import { and, eq, inArray, lte, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import {
  assertPublicHttpUrl,
  fetchPublicUrl,
  readResponseTextLimited,
} from "@/lib/net/public-url";

const MAX_DELIVERY_ATTEMPTS = 6;

export function signWebhookBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function newWebhookSecret() {
  return `nxs_${randomBytes(24).toString("base64url")}`;
}

export function webhookRetryDelayMs(attempts: number) {
  const scheduleMinutes = [1, 5, 30, 120, 360, 1_440];
  return scheduleMinutes[Math.min(Math.max(0, attempts - 1), scheduleMinutes.length - 1)] * 60_000;
}

type Destination = typeof schema.observabilityDestinations.$inferSelect;
type Delivery = typeof schema.webhookDeliveries.$inferSelect;

async function deliverWebhook(delivery: Delivery, destination: Destination) {
  const config = (destination.config ?? {}) as { url?: string; secret?: string };
  if (!config.url) {
    await db
      .update(schema.webhookDeliveries)
      .set({ status: "dead", lastError: "destination URL is missing", lastAttemptAt: new Date() })
      .where(eq(schema.webhookDeliveries.id, delivery.id));
    return;
  }
  const envelope = JSON.stringify({ event: delivery.event, data: delivery.payload });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-nexus-event": delivery.event,
    "x-nexus-delivery": delivery.id,
  };
  if (config.secret) headers["x-nexus-signature"] = signWebhookBody(config.secret, envelope);

  const attempt = delivery.attempts + 1;
  try {
    const response = await fetchPublicUrl(config.url, {
      method: "POST",
      headers,
      body: envelope,
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      throw Object.assign(new Error(`Webhook returned HTTP ${response.status}`), {
        responseStatus: response.status,
      });
    }
    await db
      .update(schema.webhookDeliveries)
      .set({
        status: "delivered",
        attempts: attempt,
        lastAttemptAt: new Date(),
        responseStatus: response.status,
        lastError: null,
        deliveredAt: new Date(),
      })
      .where(eq(schema.webhookDeliveries.id, delivery.id));
  } catch (error) {
    const terminal = attempt >= MAX_DELIVERY_ATTEMPTS;
    await db
      .update(schema.webhookDeliveries)
      .set({
        status: terminal ? "dead" : "failed",
        attempts: attempt,
        lastAttemptAt: new Date(),
        nextAttemptAt: new Date(Date.now() + webhookRetryDelayMs(attempt)),
        responseStatus:
          typeof error === "object" && error && "responseStatus" in error
            ? Number(error.responseStatus)
            : null,
        lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown delivery error",
      })
      .where(eq(schema.webhookDeliveries.id, delivery.id));
    console.warn("Nexus observability delivery failed", {
      deliveryId: delivery.id,
      destinationId: destination.id,
      attempt,
      terminal,
      message: error instanceof Error ? error.message : "unknown delivery error",
    });
  }
}

export async function dispatchGenerationWebhook(
  userId: string,
  payload: Record<string, unknown>,
  workspaceId?: string | null,
) {
  const destinations = await db
    .select()
    .from(schema.observabilityDestinations)
    .where(
      workspaceId
        ? or(
            eq(schema.observabilityDestinations.userId, userId),
            eq(schema.observabilityDestinations.workspaceId, workspaceId),
          )
        : eq(schema.observabilityDestinations.userId, userId),
    );
  const live = destinations.filter((row) => !row.deleted && row.type === "webhook");
  await Promise.all(
    live.map(async (destination) => {
      const delivery: typeof schema.webhookDeliveries.$inferInsert = {
        id: id("whd"),
        destinationId: destination.id,
        userId,
        event: "generation.completed",
        payload,
      };
      const [persisted] = await db.insert(schema.webhookDeliveries).values(delivery).returning();
      await deliverWebhook(persisted, destination);
    }),
  );
}

/** Atomically claims due rows so multiple workers do not deliver the same attempt. */
export async function retryWebhookDeliveries(limit = 50) {
  const now = new Date();
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const eligible = or(
    and(
      inArray(schema.webhookDeliveries.status, ["pending", "failed"]),
      lte(schema.webhookDeliveries.nextAttemptAt, now),
    ),
    and(eq(schema.webhookDeliveries.status, "processing"), lte(schema.webhookDeliveries.lastAttemptAt, staleBefore)),
  );
  const due = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(eligible)
    .limit(limit);
  let claimed = 0;
  for (const delivery of due) {
    const [locked] = await db
      .update(schema.webhookDeliveries)
      .set({ status: "processing", lastAttemptAt: new Date() })
      .where(
        and(
          eq(schema.webhookDeliveries.id, delivery.id),
          eligible,
        ),
      )
      .returning();
    if (!locked) continue;
    claimed += 1;
    const [destination] = await db
      .select()
      .from(schema.observabilityDestinations)
      .where(eq(schema.observabilityDestinations.id, delivery.destinationId))
      .limit(1);
    if (!destination || destination.deleted) {
      await db
        .update(schema.webhookDeliveries)
        .set({ status: "dead", lastError: "destination unavailable", lastAttemptAt: new Date() })
        .where(eq(schema.webhookDeliveries.id, delivery.id));
      continue;
    }
    await deliverWebhook({ ...delivery, status: "processing" }, destination);
  }
  return claimed;
}

export async function pingWebhookDestination(opts: {
  url: string;
  secret?: string;
  sample?: Record<string, unknown>;
}) {
  assertPublicHttpUrl(opts.url);
  const payload = opts.sample ?? {
    id: "gen-ping-sample",
    model: "nexus/auto",
    provider: "local",
    cost_micros: 0,
    latency_ms: 12,
    note: "Nexus observability ping",
  };
  const envelope = JSON.stringify({ event: "generation.completed", data: payload, ping: true });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-nexus-event": "generation.completed",
    "x-nexus-ping": "1",
  };
  if (opts.secret) headers["x-nexus-signature"] = signWebhookBody(opts.secret, envelope);
  const res = await fetchPublicUrl(opts.url, {
    method: "POST",
    headers,
    body: envelope,
    signal: AbortSignal.timeout(8_000),
  });
  const text = await readResponseTextLimited(res, 64_000);
  return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
}
