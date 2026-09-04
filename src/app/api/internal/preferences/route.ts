import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { defaultAutoTopupPaymentMethodId } from "@/lib/billing/stripe-payment-method";
import { manualCreditsEnabled } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1);
  return Response.json({
    data: {
      defaultModel: user?.defaultModel ?? "nexus/auto",
      zdr: user?.zdr ?? false,
      logPrompts: user?.logPrompts ?? false,
      allowTraining: user?.allowTraining ?? true,
      autoTopupEnabled: user?.autoTopupEnabled ?? false,
      autoTopupThresholdUsd: user?.autoTopupThresholdUsd,
      autoTopupAmountUsd: user?.autoTopupAmountUsd,
      notifyLowBalance: user?.notifyLowBalance ?? true,
      notifyKeyLimit: user?.notifyKeyLimit ?? true,
      notifyOrgInvite: user?.notifyOrgInvite ?? true,
      lowBalanceThresholdUsd: user?.lowBalanceThresholdUsd ?? "5",
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const threshold =
    body.autoTopupThresholdUsd != null ? Number(body.autoTopupThresholdUsd) : undefined;
  const amount = body.autoTopupAmountUsd != null ? Number(body.autoTopupAmountUsd) : undefined;
  if (
    (threshold != null && (!Number.isFinite(threshold) || threshold < 1 || threshold > 1_000)) ||
    (amount != null && (!Number.isFinite(amount) || amount < 10 || amount > 500))
  ) {
    return Response.json(
      { error: "Auto top-up threshold must be $1-$1,000 and amount $10-$500" },
      { status: 400 },
    );
  }
  if (body.defaultModel != null && (typeof body.defaultModel !== "string" || body.defaultModel.length > 200)) {
    return Response.json({ error: "Invalid default model" }, { status: 400 });
  }
  if (body.autoTopupEnabled === true && !manualCreditsEnabled()) {
    const [user] = await db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1);
    const stripe = getStripe();
    if (!stripe) {
      return Response.json({ error: "Stripe no está configurado para auto top-up" }, { status: 503 });
    }
    if (!user?.stripeCustomerId) {
      return Response.json(
        { error: "Completá primero una compra de créditos para guardar un medio de pago" },
        { status: 409 },
      );
    }
    try {
      const paymentMethodId = await defaultAutoTopupPaymentMethodId(stripe, user.stripeCustomerId);
      if (!paymentMethodId) {
        return Response.json(
          { error: "Elegí un medio de pago predeterminado antes de activar auto top-up" },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error("Could not verify Stripe default payment method", {
        userId: session.user.id,
        message: error instanceof Error ? error.message : "unknown",
      });
      return Response.json(
        { error: "No se pudo verificar el medio de pago con Stripe" },
        { status: 502 },
      );
    }
  }
  await db
    .update(schema.users)
    .set({
      zdr: body.zdr != null ? Boolean(body.zdr) : undefined,
      logPrompts: body.logPrompts != null ? Boolean(body.logPrompts) : undefined,
      allowTraining: body.allowTraining != null ? Boolean(body.allowTraining) : undefined,
      defaultModel: body.defaultModel ?? undefined,
      autoTopupEnabled: body.autoTopupEnabled != null ? Boolean(body.autoTopupEnabled) : undefined,
      autoTopupThresholdUsd:
        threshold != null ? String(threshold) : undefined,
      autoTopupAmountUsd: amount != null ? String(amount) : undefined,
      notifyLowBalance: body.notifyLowBalance != null ? Boolean(body.notifyLowBalance) : undefined,
      notifyKeyLimit: body.notifyKeyLimit != null ? Boolean(body.notifyKeyLimit) : undefined,
      notifyOrgInvite: body.notifyOrgInvite != null ? Boolean(body.notifyOrgInvite) : undefined,
      lowBalanceThresholdUsd:
        body.lowBalanceThresholdUsd != null ? String(body.lowBalanceThresholdUsd) : undefined,
    })
    .where(eq(schema.users.id, session.user.id));
  return Response.json({ ok: true });
}
