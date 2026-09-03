import { desc, eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { microsToUsd } from "@/lib/money";
import { manualCreditsEnabled } from "@/lib/config";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, auth.userId)).limit(1);
    const ledger = await db
      .select()
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, auth.userId))
      .orderBy(desc(schema.creditLedger.createdAt));
    const [subscription] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, auth.userId))
      .orderBy(desc(schema.subscriptions.updatedAt))
      .limit(1);
    const purchased = ledger
      .filter((entry) => entry.micros > 0 && entry.type !== "reserve_release")
      .reduce((sum, entry) => sum + entry.micros, 0);
    const used = ledger
      .filter((entry) => entry.micros < 0 && entry.type !== "reserve")
      .reduce((sum, entry) => sum + Math.abs(entry.micros), 0);
    return Response.json({
      data: {
        total_credits: microsToUsd(purchased),
        total_usage: microsToUsd(used),
        remaining: microsToUsd(user?.creditMicros ?? 0),
        manual_credits: manualCreditsEnabled(),
        plan: user?.plan ?? "free",
        subscription_status: user?.subscriptionStatus ?? "inactive",
        subscription: subscription
          ? {
              id: subscription.id,
              plan: subscription.plan,
              status: subscription.status,
              quantity: subscription.quantity,
              current_period_end: subscription.currentPeriodEnd,
              cancel_at_period_end: subscription.cancelAtPeriodEnd,
            }
          : null,
        ledger: ledger.slice(0, 50).map((l) => ({
          id: l.id,
          type: l.type,
          amount: microsToUsd(l.micros),
          note: l.note,
          created_at: l.createdAt,
        })),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
