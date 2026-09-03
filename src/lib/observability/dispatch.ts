import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export function signWebhookBody(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function newWebhookSecret() {
  return `nxs_${randomBytes(24).toString("base64url")}`;
}

export async function dispatchGenerationWebhook(
  userId: string,
  payload: Record<string, unknown>,
) {
  const rows = await db
    .select()
    .from(schema.observabilityDestinations)
    .where(eq(schema.observabilityDestinations.userId, userId));
  const live = rows.filter((r) => !r.deleted && r.type === "webhook");
  await Promise.all(
    live.map(async (row) => {
      const config = (row.config ?? {}) as { url?: string; secret?: string };
      if (!config.url) return;
      const envelope = JSON.stringify({ event: "generation.completed", data: payload });
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-nexus-event": "generation.completed",
      };
      if (config.secret) {
        headers["x-nexus-signature"] = signWebhookBody(config.secret, envelope);
      }
      await fetch(config.url, {
        method: "POST",
        headers,
        body: envelope,
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined);
    }),
  );
}

export async function pingWebhookDestination(opts: {
  url: string;
  secret?: string;
  sample?: Record<string, unknown>;
}) {
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
  const res = await fetch(opts.url, {
    method: "POST",
    headers,
    body: envelope,
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: text.slice(0, 500) };
}
