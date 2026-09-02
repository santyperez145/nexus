import { CREDIT_PACKS } from "@/lib/config";
import { getSession } from "@/lib/auth";
import { APP_URL } from "@/lib/config";
import { chargeAmountCents, getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { packId } = await req.json();
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return Response.json({ error: "Invalid pack" }, { status: 400 });
  const stripe = getStripe();
  if (!stripe) {
    return Response.json({
      error: "Stripe no configurado. Define STRIPE_SECRET_KEY para comprar créditos reales.",
    }, { status: 503 });
  }
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: session.user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: chargeAmountCents(pack.usd),
          product_data: {
            name: `Nexus credits ${pack.label}`,
            description: `Saldo de inferencia ${pack.label} + fee 4.9%`,
          },
        },
      },
    ],
    metadata: { userId: session.user.id, creditsUsd: String(pack.usd) },
    success_url: `${APP_URL}/settings/credits?ok=1`,
    cancel_url: `${APP_URL}/settings/credits?canceled=1`,
    payment_method_types: ["card", "link"],
    wallet_options: { link: { display: "auto" } },
    billing_address_collection: "auto",
    allow_promotion_codes: true,
    payment_intent_data: {
      metadata: { userId: session.user.id, creditsUsd: String(pack.usd) },
    },
  });
  return Response.json({ url: checkout.url });
}
