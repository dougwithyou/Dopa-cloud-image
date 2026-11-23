import { after, NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { creatorEmail, syncSubscription } from "@/lib/billing";
import { sendPaymentFailed, sendTrialEnding } from "@/lib/email";
import { requireEnv, portalGracePeriodDays } from "@/lib/env";
import { PLANS, formatPrice } from "@/lib/plans";
import { fulfillOrder, markOrderPaid } from "@/lib/print-fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Si un intento anterior quedó colgado más de esto, se permite reprocesar. */
const STALE_CLAIM_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Falta stripe-signature" }, { status: 400 });

  // El cuerpo debe leerse en crudo para verificar la firma.
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    console.warn("[stripe] Firma inválida", (err as Error).message);
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  const admin = createAdminClient();

  // --- Idempotencia: "reclamar" el evento insertándolo -------------------
  const claim = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (claim.error) {
    if (claim.error.code !== "23505") throw claim.error; // 23505 = unique_violation
    const { data: existing } = await admin
      .from("stripe_events")
      .select("processed_at, received_at")
      .eq("id", event.id)
      .single();
    if (existing?.processed_at) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    const age = existing ? Date.now() - new Date(existing.received_at).getTime() : 0;
    if (age < STALE_CLAIM_MS) {
      // Otro intento lo está procesando ahora mismo: que Stripe reintente luego.
      return NextResponse.json({ error: "En proceso" }, { status: 409 });
    }
    await admin.from("stripe_events").update({ received_at: new Date().toISOString() }).eq("id", event.id);
  }

  try {
    await handleEvent(event);
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe] Error procesando ${event.type} ${event.id}`, err);
    // Liberar el reclamo para que el reintento de Stripe lo procese.
    await admin.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.kind === "print_order") {
        // Pedido de impresiones: se marca pagado y se envía al laboratorio
        // después de responder a Stripe (armar el pedido tarda unos segundos).
        const orderId = await markOrderPaid(session);
        if (orderId) after(() => fulfillOrder(orderId));
        return;
      }
      if (session.mode !== "subscription" || !session.subscription) return;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await syncSubscription(subscriptionId, session.client_reference_id ?? session.metadata?.creator_id);
      return;
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      if (session.metadata?.kind === "print_order" && session.metadata.order_id) {
        await createAdminClient()
          .from("print_orders")
          .update({ status: "canceled", failure_reason: "Pago no completado" })
          .eq("id", session.metadata.order_id)
          .eq("status", "pending_payment");
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscription(event.data.object.id);
      return;
    }

    case "customer.subscription.trial_will_end": {
      // Stripe lo envía 3 días antes de que termine la prueba.
      const result = await syncSubscription(event.data.object.id);
      if (!result) return;
      const { creator, subscription } = result;
      if (subscription.status !== "trialing" || !subscription.trial_end) return;
      if (subscription.cancel_at_period_end || subscription.cancel_at) return; // no se cobrará
      const to = await creatorEmail(creator);
      if (!to) return;
      const plan = PLANS[creator.plan];
      await sendTrialEnding({
        to,
        businessName: creator.business_name,
        planName: plan.name,
        price: formatPrice(plan),
        trialEndsAt: new Date(subscription.trial_end * 1000),
      });
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const sub = invoice.parent?.subscription_details?.subscription;
      if (!sub) return;
      const result = await syncSubscription(typeof sub === "string" ? sub : sub.id);
      if (!result) return;
      const to = await creatorEmail(result.creator);
      if (to) {
        await sendPaymentFailed({
          to,
          businessName: result.creator.business_name,
          graceDays: portalGracePeriodDays(),
        });
      }
      return;
    }

    default:
      // Evento no manejado: se registra como procesado para no reintentarlo.
      return;
  }
}
