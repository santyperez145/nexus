import { getSession } from "@/lib/auth";
import { manualCreditsEnabled } from "@/lib/config";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";
import { eq, sql } from "drizzle-orm";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || !manualCreditsEnabled()) {
    return Response.json({ error: "Manual credits disabled" }, { status: 403 });
  }
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const usd = Number(body.usd ?? 0);
  if (!Number.isFinite(usd) || usd <= 0 || usd > 50) {
    return Response.json({ error: "usd must be 1–50 in sandbox" }, { status: 400 });
  }
  await ensureDb();
  const micros = usdToMicros(usd);
  await db
    .update(schema.users)
    .set({ creditMicros: sql`${schema.users.creditMicros} + ${micros}` })
    .where(eq(schema.users.id, session.user.id));
  await db.insert(schema.creditLedger).values({
    id: id("led"),
    userId: session.user.id,
    type: "manual_grant",
    micros,
    note: "Carga sandbox de wallet Nexus (ENABLE_MANUAL_CREDITS)",
  });
  return Response.json({ ok: true, addedUsd: usd });
}
