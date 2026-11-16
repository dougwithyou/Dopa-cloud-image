import "server-only";
import type Stripe from "stripe";
import { stripe, priceIdForPlan, planFromPrice } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, portalGracePeriodDays } from "@/lib/env";
import { PLANS, TRIAL_DAYS, type PlanId } from "@/lib/plans";
import type { CreatorRow, SubscriptionStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// Checkout y portal
// ---------------------------------------------------------------------------

async function ensureCustomer(creator: CreatorRow, email: string | undefined): Promise<string> {
  if (creator.stripe_customer_id) return creator.stripe_customer_id;
  const customer = await stripe().customers.create(
    {
      email,
      name: creator.business_name,
      metadata: { creator_id: creator.id, user_id: creator.user_id },
    },
    { idempotencyKey: `customer-${creator.id}` },
  );
  const admin = createAdminClient();
  const { error } = await admin
    .from("creators")
    .update({ stripe_customer_id: customer.id })
    .eq("id", creator.id)
    .is("stripe_customer_id", null);
  if (error) throw error;
  return customer.id;
}

/**
 * Checkout de suscripción con 30 días de prueba y tarjeta obligatoria.
 * Si el creador ya tuvo una suscripción (p. ej. canceló y vuelve), no se
 * vuelve a regalar la prueba.
 */
export async function createCheckoutSession(
  creator: CreatorRow,
  plan: PlanId,
  email: string | undefined,
): Promise<string> {
  const customer = await ensureCustomer(creator, email);
  const price = await priceIdForPlan(plan);
  const trialEligible = !creator.stripe_subscription_id;

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: creator.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: "always",
    allow_promotion_codes: true,
    subscription_data: {
      ...(trialEligible
        ? {
            trial_period_days: TRIAL_DAYS,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : {}),
      metadata: { creator_id: creator.id, plan },
    },
    metadata: { creator_id: creator.id, plan },
    success_url: appUrl("/api/stripe/checkout/success?session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: appUrl("/onboarding?checkout=canceled"),
  });
  if (!session.url) throw new Error("Stripe no devolvió la URL de Checkout");
  return session.url;
}

export async function createPortalSession(creator: CreatorRow): Promise<string> {
  if (!creator.stripe_customer_id) throw new Error("El creador no tiene cliente de Stripe");
  const session = await stripe().billingPortal.sessions.create({
    customer: creator.stripe_customer_id,
    return_url: appUrl("/dashboard/billing"),
    ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID
      ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID }
      : {}),
  });
  return session.url;
}

// ---------------------------------------------------------------------------
// Sincronización de suscripciones (usada por el webhook)
// ---------------------------------------------------------------------------

export function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    default:
      return "incomplete";
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function findCreatorForSubscription(
  sub: Stripe.Subscription,
  creatorIdHint?: string | null,
): Promise<CreatorRow | null> {
  const admin = createAdminClient();
  const bySub = await admin.from("creators").select("*").eq("stripe_subscription_id", sub.id).maybeSingle();
  if (bySub.data) return bySub.data;

  const creatorId = creatorIdHint || sub.metadata?.creator_id;
  if (creatorId) {
    const byId = await admin.from("creators").select("*").eq("id", creatorId).maybeSingle();
    if (byId.data) return byId.data;
  }

  const customerId = idOf(sub.customer);
  if (customerId) {
    const byCustomer = await admin.from("creators").select("*").eq("stripe_customer_id", customerId).maybeSingle();
    if (byCustomer.data) return byCustomer.data;
  }
  return null;
}

/**
 * Lee la suscripción ACTUAL desde Stripe (no confía en el payload del evento,
 * que puede llegar desordenado) y la refleja en `creators`.
 */
export async function syncSubscription(
  subscriptionId: string,
  creatorIdHint?: string | null,
): Promise<{ creator: CreatorRow; subscription: Stripe.Subscription } | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
  const creator = await findCreatorForSubscription(sub, creatorIdHint);
  if (!creator) {
    console.warn(`[stripe] Sin creador para la suscripción ${sub.id}`);
    return null;
  }

  const status = mapStripeStatus(sub.status);

  // Un evento tardío de una suscripción antigua no debe pisar la actual.
  if (creator.stripe_subscription_id && creator.stripe_subscription_id !== sub.id && status !== "active" && status !== "trialing") {
    console.info(`[stripe] Ignorando suscripción antigua ${sub.id} del creador ${creator.id}`);
    return { creator, subscription: sub };
  }

  const price = sub.items.data[0]?.price;
  const plan = (price && planFromPrice(price)) || creator.plan;
  const limits = PLANS[plan];

  const good = status === "trialing" || status === "active";
  let portalAccessUntil: string | null = null;
  if (!good) {
    portalAccessUntil =
      creator.portal_access_until ??
      new Date(Date.now() + portalGracePeriodDays() * 86_400_000).toISOString();
  }

  const update: Partial<CreatorRow> = {
    plan,
    stripe_customer_id: idOf(sub.customer),
    stripe_subscription_id: sub.id,
    subscription_status: status,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    storage_limit_bytes: limits.storageBytes,
    client_limit: limits.clientLimit,
    portal_access_until: portalAccessUntil,
  };

  const admin = createAdminClient();
  const { data, error } = await admin.from("creators").update(update).eq("id", creator.id).select("*").single();
  if (error) throw error;
  return { creator: data, subscription: sub };
}

/** Email del usuario dueño de la cuenta de creador. */
export async function creatorEmail(creator: CreatorRow): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(creator.user_id);
  if (error) return null;
  return data.user?.email ?? null;
}
