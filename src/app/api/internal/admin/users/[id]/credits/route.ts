import { getSession } from "@/lib/auth";
import { adjustUserCredits, MAX_ADMIN_CREDIT_ADJUSTMENT_MICROS } from "@/lib/admin/credit-adjustment";
import { isPlatformAdmin } from "@/lib/config";
import { ensureDb } from "@/lib/db";
import { usdToMicros } from "@/lib/money";

type Context = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Context) {
  try {
    const session = await getSession();
    if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!isPlatformAdmin(session.user.email)) {
      return Response.json({ error: "Platform admin required" }, { status: 403 });
    }
    const body = (await req.json()) as {
      amount_usd?: unknown;
      reason?: unknown;
      idempotency_key?: unknown;
    };
    const amountUsd = Number(body.amount_usd);
    if (!Number.isFinite(amountUsd) || amountUsd === 0) {
      return Response.json({ error: "amount_usd must be a non-zero number" }, { status: 400 });
    }
    const micros = usdToMicros(amountUsd);
    if (Math.abs(micros) > MAX_ADMIN_CREDIT_ADJUSTMENT_MICROS) {
      return Response.json({ error: "amount_usd exceeds the USD 10,000 operator limit" }, { status: 400 });
    }
    const { id: targetUserId } = await context.params;
    await ensureDb();
    const result = await adjustUserCredits({
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      targetUserId,
      micros,
      reason: String(body.reason ?? ""),
      idempotencyKey: String(body.idempotency_key ?? ""),
    });
    return Response.json({
      data: {
        applied: result.applied,
        balance_usd: result.balanceMicros / 1_000_000,
      },
    });
  } catch (error) {
    const status = Number((error as { status?: number }).status ?? 500);
    return Response.json(
      { error: error instanceof Error ? error.message : "Credit adjustment failed" },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}
