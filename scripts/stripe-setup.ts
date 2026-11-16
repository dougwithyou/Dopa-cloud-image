/**
 * Crea (o reutiliza) los productos, precios y la configuración del Customer
 * Portal en Stripe a partir de src/lib/plans.ts.
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 *
 * Por seguridad se niega a ejecutarse con una clave live salvo que pases
 * --live Y STRIPE_CONFIRM_LIVE=yes. Es idempotente: puedes ejecutarlo varias veces.
 */
import Stripe from "stripe";
import { PLANS, PLAN_IDS } from "../src/lib/plans.ts";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Falta STRIPE_SECRET_KEY");
  process.exit(1);
}

const isLive = key.startsWith("sk_live_") || key.startsWith("rk_live_");
if (isLive && !(process.argv.includes("--live") && process.env.STRIPE_CONFIRM_LIVE === "yes")) {
  console.error(
    "Clave LIVE detectada. No se creará nada.\n" +
      "Si de verdad quieres crear productos en modo live: STRIPE_CONFIRM_LIVE=yes npm run stripe:setup -- --live",
  );
  process.exit(1);
}

const stripe = new Stripe(key);
const appName = process.env.NEXT_PUBLIC_APP_NAME || "Hi Dopa Cloud";
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function ensureProduct(id: string, name: string, planId: string): Promise<Stripe.Product> {
  try {
    const existing = await stripe.products.retrieve(id);
    if (!existing.active || existing.name !== name) {
      return stripe.products.update(id, { active: true, name });
    }
    return existing;
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
    return stripe.products.create({ id, name, metadata: { plan_id: planId } });
  }
}

async function ensurePrice(product: Stripe.Product, plan: (typeof PLANS)[keyof typeof PLANS]): Promise<Stripe.Price> {
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
  const current = found.data[0];
  if (
    current &&
    current.active &&
    current.unit_amount === plan.priceCents &&
    current.currency === plan.currency &&
    current.recurring?.interval === "month" &&
    current.product === product.id
  ) {
    return current;
  }
  // Precio nuevo o distinto: se crea y se transfiere el lookup_key.
  const price = await stripe.prices.create({
    product: product.id,
    currency: plan.currency,
    unit_amount: plan.priceCents,
    recurring: { interval: "month" },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
    metadata: { plan_id: plan.id },
  });
  if (current && current.id !== price.id) await stripe.prices.update(current.id, { active: false });
  await stripe.products.update(product.id, { default_price: price.id });
  return price;
}

async function main() {
  console.log(`Modo: ${isLive ? "LIVE" : "test"}\n`);
  const env: string[] = [];
  const portalProducts: Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product[] = [];

  for (const id of PLAN_IDS) {
    const plan = PLANS[id];
    const product = await ensureProduct(plan.stripeProductId, `${appName} ${plan.name}`, plan.id);
    const price = await ensurePrice(product, plan);
    console.log(`✓ ${plan.name}: ${product.id} · ${price.id} · $${(plan.priceCents / 100).toFixed(2)}/mes`);
    env.push(`STRIPE_PRICE_${id.toUpperCase()}=${price.id}`);
    portalProducts.push({ product: product.id, prices: [price.id] });
  }

  const portal = await stripe.billingPortal.configurations.create({
    business_profile: { headline: `${appName} — gestiona tu suscripción` },
    default_return_url: `${appUrl}/dashboard/billing`,
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: portalProducts,
      },
    },
  });
  env.push(`STRIPE_PORTAL_CONFIGURATION_ID=${portal.id}`);

  console.log("\nAñade a tu .env.local (y a Vercel):\n");
  console.log(env.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
