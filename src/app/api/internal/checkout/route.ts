import { and, eq, inArray } from "drizzle-orm";
import {
  CREDIT_PACKS,
  APP_URL,
  creditPurchaseFeeUsd,
  SUBSCRIPTION_PLANS,
  stripePriceForPlan,
  stripePortalConfigurationId,
  stripeAutomaticTaxEnabled,
  type SubscriptionPlanId,
} from "@/lib/config";
import { getSession } from "@/lib/auth";
import { db, ensureDb, schema } from "@/lib/db";
import {
  chargeAmountCents,
  checkoutIntegrationId,
  getStripe,
} from "@/lib/stripe";
import {
  checkoutSessionBelongsToUser,
  validCheckoutSessionId,
} from "@/lib/billing/checkout-return";
import { reconcileWalletCheckout } from "@/lib/billing/stripe-event-processor";
import {
  consumeBillingOperationRateLimit,
  type BillingOperation,
} from "@/lib/billing/operation-rate-limit";
import {
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "@/lib/operation-rate-limit";

async function enforceBillingOperationLimit(
  userId: string,
  operation: BillingOperation,
) {
  try {
    const result = await consumeBillingOperationRateLimit(userId, operation);
    if (result.allowed) return null;
    return rateLimitExceededResponse(
      result,
      "Demasiadas operaciones de facturación. Intentá nuevamente más tarde.",
    );
  } catch (error) {
    console.error("Billing operation rate limit unavailable", {
      operation,
      userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return rateLimitUnavailableResponse();
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceBillingOperationLimit(
    session.user.id,
    "checkout_create",
  );
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Ingresá una solicitud de compra válida" }, { status: 400 });
  }
  const packId = typeof body.packId === "string" ? body.packId : "";
  const planId = typeof body.planId === "string" ? body.planId : "";
  const rawSeats = body.seats;
  if (Boolean(packId) === Boolean(planId)) {
    return Response.json(
      { error: "Elegí una carga de saldo o un plan" },
      { status: 400 },
    );
  }
  const stripe = getStripe();
  if (!stripe) {
    return Response.json(
      {
        error:
          "Stripe no configurado. Define STRIPE_SECRET_KEY para comprar créditos reales.",
      },
      { status: 503 },
    );
  }
  await ensureDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);

  if (planId) {
    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) return Response.json({ error: "Invalid plan" }, { status: 400 });
    const price = stripePriceForPlan(plan.id as SubscriptionPlanId);
    if (!price) {
      return Response.json(
        { error: `Stripe price not configured for ${plan.name}` },
        { status: 503 },
      );
    }
    const [activeSubscription] = await db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, session.user.id),
          inArray(schema.subscriptions.status, [
            "incomplete",
            "trialing",
            "active",
            "past_due",
            "unpaid",
            "paused",
          ]),
        ),
      )
      .limit(1);
    if (activeSubscription) {
      return Response.json(
        { error: "Use Manage subscription to change an existing plan" },
        { status: 409 },
      );
    }
    const seatsNumber = rawSeats == null ? 1 : Number(rawSeats);
    if (plan.seats && (!Number.isInteger(seatsNumber) || seatsNumber < 1 || seatsNumber > 250)) {
      return Response.json(
        { error: "La cantidad de asientos debe estar entre 1 y 250" },
        { status: 400 },
      );
    }
    const seats = plan.seats ? seatsNumber : 1;
    try {
      const checkout = await stripe.checkout.sessions.create({
        mode: "subscription",
        integration_identifier: checkoutIntegrationId(`subscription_${plan.id}`),
        ...(user?.stripeCustomerId
          ? { customer: user.stripeCustomerId }
          : { customer_email: session.user.email }),
        client_reference_id: session.user.id,
        line_items: [{ price, quantity: seats }],
        metadata: { userId: session.user.id, planId: plan.id },
        subscription_data: {
          metadata: { userId: session.user.id, planId: plan.id },
        },
        success_url: `${APP_URL}/settings/credits?subscription=ok`,
        cancel_url: `${APP_URL}/settings/credits?subscription=canceled`,
        billing_address_collection: "auto",
        automatic_tax: { enabled: stripeAutomaticTaxEnabled() },
        ...(user?.stripeCustomerId
          ? { customer_update: { address: "auto" as const } }
          : {}),
        allow_promotion_codes: false,
      });
      if (!checkout.url) throw new Error("Stripe Checkout returned no URL");
      return Response.json({ url: checkout.url });
    } catch (error) {
      console.error("Stripe subscription checkout creation failed", {
        userId: session.user.id,
        planId: plan.id,
        error: error instanceof Error ? error.message : "unknown",
      });
      return Response.json(
        { error: "No se pudo iniciar la suscripción con Stripe" },
        { status: 502 },
      );
    }
  }

  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return Response.json({ error: "Invalid pack" }, { status: 400 });
  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      integration_identifier: checkoutIntegrationId("credits"),
      client_reference_id: session.user.id,
      ...(user?.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : {
            customer_email: session.user.email,
            customer_creation: "always" as const,
          }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: chargeAmountCents(pack.usd),
            product_data: {
              name: `Créditos Nexus ${pack.label}`,
              description: `Saldo de inferencia ${pack.label} + comisión USD ${creditPurchaseFeeUsd(pack.usd).toFixed(2)}`,
            },
          },
        },
      ],
      metadata: { userId: session.user.id, creditsUsd: String(pack.usd) },
      success_url: `${APP_URL}/settings/credits?checkout_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/settings/credits?canceled=1`,
      billing_address_collection: "auto",
      automatic_tax: { enabled: stripeAutomaticTaxEnabled() },
      ...(user?.stripeCustomerId
        ? { customer_update: { address: "auto" as const } }
        : {}),
      allow_promotion_codes: false,
      payment_intent_data: {
        setup_future_usage: "off_session",
        metadata: { userId: session.user.id, creditsUsd: String(pack.usd) },
      },
    });
    if (!checkout.url) throw new Error("Stripe Checkout returned no URL");
    return Response.json({ url: checkout.url });
  } catch (error) {
    console.error("Stripe wallet checkout creation failed", {
      userId: session.user.id,
      packId: pack.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "No se pudo iniciar la carga de saldo con Stripe" },
      { status: 502 },
    );
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return Response.json(
      { error: { message: "Unauthorized" } },
      { status: 401 },
    );
  }
  const limited = await enforceBillingOperationLimit(
    session.user.id,
    "checkout_reconcile",
  );
  if (limited) return limited;
  const stripe = getStripe();
  if (!stripe) {
    return Response.json(
      { error: { message: "Stripe no configurado" } },
      { status: 503 },
    );
  }

  let sessionId: unknown;
  try {
    sessionId = (await req.json())?.sessionId;
  } catch {
    return Response.json(
      { error: { message: "Cuerpo JSON inválido" } },
      { status: 400 },
    );
  }
  if (!validCheckoutSessionId(sessionId)) {
    return Response.json(
      { error: { message: "Checkout Session inválida" } },
      { status: 400 },
    );
  }

  try {
    const checkout = await stripe.checkout.sessions.retrieve(
      sessionId,
      {},
      { timeout: 8_000 },
    );
    if (!checkoutSessionBelongsToUser(checkout, session.user.id)) {
      return Response.json(
        { error: { message: "Checkout Session no encontrada" } },
        { status: 404 },
      );
    }
    if (checkout.mode !== "payment") {
      return Response.json(
        { error: { message: "La sesión no corresponde a una carga de saldo" } },
        { status: 409 },
      );
    }

    const result = await reconcileWalletCheckout(stripe, checkout);
    return Response.json({
      data: {
        settled: result.settled,
        credited: result.credited,
        creditsUsd: result.creditsUsd,
        paymentStatus: checkout.payment_status,
      },
    });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : Number.NaN;
    if (status === 404) {
      return Response.json(
        { error: { message: "Checkout Session no encontrada" } },
        { status: 404 },
      );
    }
    console.error("Stripe checkout reconciliation failed", {
      userId: session.user.id,
      status: Number.isFinite(status) ? status : undefined,
    });
    return Response.json(
      { error: { message: "No se pudo verificar el pago con Stripe" } },
      { status: 502 },
    );
  }
}

export async function PATCH() {
  const session = await getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceBillingOperationLimit(
    session.user.id,
    "portal_create",
  );
  if (limited) return limited;
  const stripe = getStripe();
  if (!stripe)
    return Response.json({ error: "Stripe not configured" }, { status: 503 });
  await ensureDb();
  const [user] = await db
    .select({ stripeCustomerId: schema.users.stripeCustomerId })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user?.stripeCustomerId) {
    return Response.json({ error: "No billing profile yet" }, { status: 404 });
  }
  const portalConfiguration = stripePortalConfigurationId();
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      ...(portalConfiguration ? { configuration: portalConfiguration } : {}),
      return_url: `${APP_URL}/settings/credits`,
    });
    if (!portal.url) throw new Error("Stripe Billing Portal returned no URL");
    return Response.json({ url: portal.url });
  } catch (error) {
    console.error("Stripe billing portal creation failed", {
      userId: session.user.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      { error: "No se pudo abrir el portal de facturación" },
      { status: 502 },
    );
  }
}
