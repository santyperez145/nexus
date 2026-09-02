import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { db, schema } from "@/lib/db";
import { microsToUsd } from "@/lib/money";

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, auth.userId)).limit(1);
    const ledger = await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.userId, auth.userId));
    const purchased = ledger.filter((l) => l.micros > 0).reduce((s, l) => s + l.micros, 0);
    const used = ledger.filter((l) => l.micros < 0).reduce((s, l) => s + Math.abs(l.micros), 0);
    return Response.json({
      data: {
        total_credits: microsToUsd(purchased),
        total_usage: microsToUsd(used),
        remaining: microsToUsd(user?.creditMicros ?? 0),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
