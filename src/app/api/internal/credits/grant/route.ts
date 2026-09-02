import { eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import { id } from "@/lib/ids";
import { usdToMicros } from "@/lib/money";

export async function POST(req: Request) {
  if (process.env.ENABLE_MANUAL_CREDITS === "false") {
    return Response.json({ error: "Manual credits disabled" }, { status: 403 });
  }
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const usd = Number(body.usd ?? 0);
  if (!Number.isFinite(usd) || usd <= 0 || usd > 500) {
    return Response.json({ error: "usd must be 1–500" }, { status: 400 });
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
    note: "Carga manual de wallet Nexus",
  });
  return Response.json({ ok: true, addedUsd: usd });
}
