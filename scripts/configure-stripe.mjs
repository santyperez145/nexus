import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) throw new Error("STRIPE_SECRET_KEY is required");
const liveMode = key.startsWith("sk_live_") || key.startsWith("rk_live_");
if (liveMode && !process.argv.includes("--allow-live")) {
  throw new Error("Refusing to change Stripe live mode without --allow-live");
}

const appUrl = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")
).replace(/\/$/, "");
if (!appUrl.startsWith("https://")) throw new Error("A public HTTPS app URL is required");

const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
const plans = [
  {
    id: "pro",
    name: "Nexus Pro",
    monthlyUsd: 19,
    description: "600 RPM, 25 API keys, 5 workspaces and USD 5 monthly inference credits.",
    adjustableQuantity: false,
  },
  {
    id: "team",
    name: "Nexus Team",
    monthlyUsd: 49,
    description: "1,800 RPM, 250 API keys, shared workspaces with RBAC and USD 15 monthly inference credits per billing cycle.",
    adjustableQuantity: true,
  },
];

function objectId(value) {
  return typeof value === "string" ? value : value?.id;
}

async function ensureProduct(plan) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((candidate) => candidate.metadata?.nexus_plan === plan.id);
  const attributes = {
    name: plan.name,
    description: plan.description,
    metadata: { nexus_managed: "true", nexus_plan: plan.id },
  };
  if (product) return stripe.products.update(product.id, attributes);
  product = await stripe.products.create(attributes, {
    idempotencyKey: `nexus-product-${plan.id}-v1`,
  });
  return product;
}

async function ensurePrice(plan, product) {
  const lookupKey = `nexus_${plan.id}_monthly_usd_v1`;
  const prices = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 100 });
  const existing = prices.data[0];
  const expectedAmount = plan.monthlyUsd * 100;
  if (existing) {
    if (
      objectId(existing.product) !== product.id ||
      existing.currency !== "usd" ||
      existing.unit_amount !== expectedAmount ||
      existing.recurring?.interval !== "month"
    ) {
      throw new Error(`Stripe lookup key ${lookupKey} does not match the Nexus ${plan.id} plan`);
    }
    return existing;
  }
  return stripe.prices.create(
    {
      product: product.id,
      currency: "usd",
      unit_amount: expectedAmount,
      recurring: { interval: "month", usage_type: "licensed" },
      lookup_key: lookupKey,
      metadata: { nexus_managed: "true", nexus_plan: plan.id },
    },
    { idempotencyKey: `nexus-price-${plan.id}-monthly-usd-v1` },
  );
}

const productsAndPrices = [];
for (const plan of plans) {
  const product = await ensureProduct(plan);
  const price = await ensurePrice(plan, product);
  if (objectId(product.default_price) !== price.id) {
    await stripe.products.update(product.id, { default_price: price.id });
  }
  productsAndPrices.push({ plan, product, price });
}

const webhookUrl = `${appUrl}/api/webhooks/stripe`;
const webhookEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
];
const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const webhook = webhookEndpoints.data.find((candidate) => candidate.url === webhookUrl);
if (!webhook) {
  throw new Error(`Create the signed webhook ${webhookUrl} first so its secret can be stored safely`);
}
const reconciledWebhook = await stripe.webhookEndpoints.update(webhook.id, {
  enabled_events: webhookEvents,
  description: "Nexus billing lifecycle",
  metadata: { nexus_managed: "true" },
});

const portalProducts = productsAndPrices.map(({ plan, product, price }) => ({
  product: product.id,
  prices: [price.id],
  adjustable_quantity: plan.adjustableQuantity
    ? { enabled: true, minimum: 1, maximum: 250 }
    : { enabled: false },
}));
const portalAttributes = {
  active: true,
  name: "Nexus subscriptions",
  default_return_url: `${appUrl}/settings/credits`,
  business_profile: {
    headline: "Manage your Nexus subscription and billing details.",
    privacy_policy_url: `${appUrl}/privacy`,
    terms_of_service_url: `${appUrl}/terms`,
  },
  metadata: { nexus_managed: "true", nexus_configuration: "subscriptions_v1" },
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      cancellation_reason: {
        enabled: true,
        options: [
          "too_expensive",
          "missing_features",
          "low_quality",
          "unused",
          "switched_service",
          "other",
        ],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ["price", "quantity"],
      billing_cycle_anchor: "unchanged",
      proration_behavior: "create_prorations",
      products: portalProducts,
    },
  },
};
const portalConfigurations = await stripe.billingPortal.configurations.list({ limit: 100 });
let portal = portalConfigurations.data.find(
  (candidate) => candidate.metadata?.nexus_configuration === "subscriptions_v1",
);
const portalCreateAttributes = { ...portalAttributes };
delete portalCreateAttributes.active;
portal = portal
  ? await stripe.billingPortal.configurations.update(portal.id, portalAttributes)
  : await stripe.billingPortal.configurations.create(portalCreateAttributes, {
      idempotencyKey: "nexus-portal-subscriptions-v3",
    });

const account = await stripe.accounts.retrieveCurrent();
const pro = productsAndPrices.find(({ plan }) => plan.id === "pro");
const team = productsAndPrices.find(({ plan }) => plan.id === "team");
console.log(
  JSON.stringify(
    {
      mode: liveMode ? "live" : "test",
      account: {
        id: account.id,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
      },
      STRIPE_PRICE_PRO_MONTHLY: pro.price.id,
      STRIPE_PRICE_TEAM_MONTHLY: team.price.id,
      STRIPE_PORTAL_CONFIGURATION_ID: portal.id,
      webhook: { id: reconciledWebhook.id, url: reconciledWebhook.url, events: webhookEvents },
      automaticTaxEnabled: false,
    },
    null,
    2,
  ),
);
