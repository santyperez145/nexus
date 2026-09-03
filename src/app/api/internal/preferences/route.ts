import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1);
  return Response.json({
    data: {
      defaultModel: user?.defaultModel ?? "nexus/auto",
      zdr: user?.zdr ?? false,
      logPrompts: user?.logPrompts ?? false,
      allowTraining: user?.allowTraining ?? false,
      autoTopupEnabled: user?.autoTopupEnabled ?? false,
      autoTopupThresholdUsd: user?.autoTopupThresholdUsd,
      autoTopupAmountUsd: user?.autoTopupAmountUsd,
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await db
    .update(schema.users)
    .set({
      zdr: body.zdr != null ? Boolean(body.zdr) : undefined,
      logPrompts: body.logPrompts != null ? Boolean(body.logPrompts) : undefined,
      allowTraining: body.allowTraining != null ? Boolean(body.allowTraining) : undefined,
      defaultModel: body.defaultModel ?? undefined,
      autoTopupEnabled: body.autoTopupEnabled != null ? Boolean(body.autoTopupEnabled) : undefined,
      autoTopupThresholdUsd:
        body.autoTopupThresholdUsd != null ? String(body.autoTopupThresholdUsd) : undefined,
      autoTopupAmountUsd: body.autoTopupAmountUsd != null ? String(body.autoTopupAmountUsd) : undefined,
    })
    .where(eq(schema.users.id, session.user.id));
  return Response.json({ ok: true });
}
