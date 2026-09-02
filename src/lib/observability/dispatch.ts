import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

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
      const config = (row.config ?? {}) as { url?: string };
      if (!config.url) return;
      await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-nexus-event": "generation" },
        body: JSON.stringify({ event: "generation.completed", data: payload }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => undefined);
    }),
  );
}
