import type Stripe from "stripe";

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String(value.id);
  return null;
}

export function customerDefaultPaymentMethodId(customer: Stripe.Customer | Stripe.DeletedCustomer) {
  if (customer.deleted) return null;
  return objectId(customer.invoice_settings.default_payment_method);
}

export async function defaultAutoTopupPaymentMethodId(stripe: Stripe, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId);
  return customerDefaultPaymentMethodId(customer);
}

export async function ensureAutoTopupPaymentMethod(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  if (session.mode !== "payment" || session.payment_status !== "paid") return null;
  const customerId = objectId(session.customer);
  const paymentIntentId = objectId(session.payment_intent);
  if (!customerId || !paymentIntentId) return null;

  const customer = await stripe.customers.retrieve(customerId);
  const existing = customerDefaultPaymentMethodId(customer);
  if (existing) return existing;
  if (customer.deleted) return null;

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const paymentMethodId = objectId(intent.payment_method);
  if (!paymentMethodId) return null;
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (paymentMethod.type !== "card" || objectId(paymentMethod.customer) !== customerId) return null;

  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });
  return paymentMethodId;
}
