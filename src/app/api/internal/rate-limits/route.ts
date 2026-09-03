import { and, eq, gte } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import {
  FREE_MODEL_CREDITS_THRESHOLD_USD,
  FREE_MODEL_RPD_NO_CREDITS,
  FREE_MODEL_RPD_WITH_CREDITS,
} from "@/lib/config";
import { limitsForPlan } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { microsToUsd } from "@/lib/money";
import { cache } from "@/lib/redis";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const minute = Math.floor(Date.now() / 60000);
  const redis = await cache();
  const usedRaw = await redis.get(`rl:${userId}:${minute}`);
  const rpmUsed = Number(usedRaw ?? 0) || 0;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const freeRows = await db
    .select({ id: schema.generations.id })
    .from(schema.generations)
    .where(
      and(
        eq(schema.generations.userId, userId),
        gte(schema.generations.createdAt, since),
        eq(schema.generations.costMicros, 0),
      ),
    );
  const creditUsd = microsToUsd(user?.creditMicros ?? 0);
  const rpmLimit = limitsForPlan(user?.plan).rpm;
  const hasCredits = creditUsd >= FREE_MODEL_CREDITS_THRESHOLD_USD;
  const freeRpdLimit = hasCredits ? FREE_MODEL_RPD_WITH_CREDITS : FREE_MODEL_RPD_NO_CREDITS;

  return Response.json({
    data: {
      rpm_limit: rpmLimit,
      rpm_used: Math.min(rpmUsed, rpmLimit + 5),
      rpm_window: "minute",
      free_rpd_limit: freeRpdLimit,
      free_rpd_used: freeRows.length,
      free_rpd_note: hasCredits
        ? `Saldo ≥ $${FREE_MODEL_CREDITS_THRESHOLD_USD} → cuota free alta`
        : `Saldo < $${FREE_MODEL_CREDITS_THRESHOLD_USD} → cuota free baja`,
    },
  });
}
