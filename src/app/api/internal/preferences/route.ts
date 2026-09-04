import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { defaultAutoTopupPaymentMethodId } from "@/lib/billing/stripe-payment-method";
import { manualCreditsEnabled } from "@/lib/config";
import { db, schema } from "@/lib/db";
import { applyPreferenceUpdate } from "@/lib/privacy/preferences";
import { getStripe } from "@/lib/stripe";
import { enforceControlPlaneOperationRateLimit } from "@/lib/control-plane/operation-rate-limit";

export async function GET() {
  const session = await getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
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
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid preferences" }, { status: 400 });
  }
  const booleanFields = [
    "zdr",
    "logPrompts",
    "allowTraining",
    "autoTopupEnabled",
    "notifyLowBalance",
    "notifyKeyLimit",
    "notifyOrgInvite",
  ] as const;
  if (
    booleanFields.some(
      (field) => body[field] != null && typeof body[field] !== "boolean",
    )
  ) {
    return Response.json(
      { error: "Preference flags must be booleans" },
      { status: 400 },
    );
  }
  const threshold =
    body.autoTopupThresholdUsd != null
      ? Number(body.autoTopupThresholdUsd)
      : undefined;
  const amount =
    body.autoTopupAmountUsd != null
      ? Number(body.autoTopupAmountUsd)
      : undefined;
  const lowBalanceThreshold =
    body.lowBalanceThresholdUsd != null
      ? Number(body.lowBalanceThresholdUsd)
      : undefined;
  if (
    (threshold != null &&
      (!Number.isFinite(threshold) || threshold < 1 || threshold > 1_000)) ||
    (amount != null &&
      (!Number.isFinite(amount) || amount < 10 || amount > 500)) ||
    (lowBalanceThreshold != null &&
      (!Number.isFinite(lowBalanceThreshold) ||
        lowBalanceThreshold < 0.01 ||
        lowBalanceThreshold > 10_000))
  ) {
    return Response.json(
      {
        error:
          "Auto top-up threshold must be $1-$1,000, amount $10-$500 and low-balance threshold $0.01-$10,000",
      },
      { status: 400 },
    );
  }
  if (
    body.defaultModel != null &&
    (typeof body.defaultModel !== "string" || body.defaultModel.length > 200)
  ) {
    return Response.json({ error: "Invalid default model" }, { status: 400 });
  }
  if (body.autoTopupEnabled === true && !manualCreditsEnabled()) {
    const limited = await enforceControlPlaneOperationRateLimit(
      session.user.id,
      "auto_topup_verify",
    );
    if (limited) return limited;
    const [user] = await db
      .select({ stripeCustomerId: schema.users.stripeCustomerId })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1);
    const stripe = getStripe();
    if (!stripe) {
      return Response.json(
        { error: "Stripe no está configurado para auto top-up" },
        { status: 503 },
      );
    }
    if (!user?.stripeCustomerId) {
      return Response.json(
        {
          error:
            "Completá primero una compra de créditos para guardar un medio de pago",
        },
        { status: 409 },
      );
    }
    try {
      const paymentMethodId = await defaultAutoTopupPaymentMethodId(
        stripe,
        user.stripeCustomerId,
      );
      if (!paymentMethodId) {
        return Response.json(
          {
            error:
              "Elegí un medio de pago predeterminado antes de activar auto top-up",
          },
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
  const result = await applyPreferenceUpdate(session.user.id, {
    zdr: body.zdr != null ? body.zdr : undefined,
    logPrompts: body.logPrompts != null ? body.logPrompts : undefined,
    allowTraining: body.allowTraining != null ? body.allowTraining : undefined,
    defaultModel: body.defaultModel ?? undefined,
    autoTopupEnabled:
      body.autoTopupEnabled != null ? body.autoTopupEnabled : undefined,
    autoTopupThresholdUsd: threshold != null ? String(threshold) : undefined,
    autoTopupAmountUsd: amount != null ? String(amount) : undefined,
    notifyLowBalance:
      body.notifyLowBalance != null ? body.notifyLowBalance : undefined,
    notifyKeyLimit:
      body.notifyKeyLimit != null ? body.notifyKeyLimit : undefined,
    notifyOrgInvite:
      body.notifyOrgInvite != null ? body.notifyOrgInvite : undefined,
    lowBalanceThresholdUsd:
      lowBalanceThreshold != null ? String(lowBalanceThreshold) : undefined,
  });
  return Response.json({
    ok: true,
    data: result.privacy,
    purged: result.purged,
  });
}
