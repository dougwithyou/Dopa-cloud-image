import "server-only";
import Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { PLANS, type PlanId } from "@/lib/plans";

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeClient) {
    const key = requireEnv("STRIPE_SECRET_KEY");
    if (key.startsWith("sk_live_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
      // Protección: no operar en modo live sin confirmación explícita.
      throw new Error("Clave live de Stripe detectada sin STRIPE_ALLOW_LIVE=true. Abortando.");
    }
    stripeClient = new Stripe(key, { appInfo: { name: "Hi Dopa Cloud" } });
  }
  return stripeClient;
}

const priceCache = new Map<PlanId, string>();

/**
 * Id del precio de Stripe para un plan: primero la variable STRIPE_PRICE_<PLAN>,
 * si no existe se busca por lookup_key (creado por scripts/stripe-setup.ts).
 */
export async function priceIdForPlan(plan: PlanId): Promise<string> {
  const fromEnv = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (fromEnv) return fromEnv;
  const cached = priceCache.get(plan);
  if (cached) return cached;
  const prices = await stripe().prices.list({ lookup_keys: [PLANS[plan].lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No hay precio en Stripe para el plan ${plan}. Ejecuta npm run stripe:setup.`);
  priceCache.set(plan, price.id);
  return price.id;
}

/** Plan correspondiente a un precio de Stripe (por lookup_key o por id). */
export function planFromPrice(price: Stripe.Price): PlanId | null {
  for (const plan of Object.values(PLANS)) {
    if (price.lookup_key === plan.lookupKey) return plan.id;
    if (process.env[`STRIPE_PRICE_${plan.id.toUpperCase()}`] === price.id) return plan.id;
  }
  const meta = price.metadata?.plan_id;
  if (meta && meta in PLANS) return meta as PlanId;
  return null;
}
