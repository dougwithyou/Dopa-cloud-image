import "server-only";
import type Stripe from "stripe";
import { creatorEmail } from "@/lib/billing";
import {
  sendNewSaleToCreator,
  sendPrintOrderConfirmation,
  sendPrintOrderProblem,
  sendPrintOrderShipped,
} from "@/lib/email";
import { buildOrderItems, getSubmission, submitOrder, waitForItems, WhccError, type WhccEvent } from "@/lib/labs/whcc";
import { formatUsd, settle } from "@/lib/print-pricing";
import { signDownloadUrl } from "@/lib/r2";
import { stripe } from "@/lib/stripe";
import { orderUrl } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PrintOrderRow, TrackingInfo } from "@/types/database";

// Ciclo de vida de un pedido de impresiones:
//   pending_payment → paid (Stripe) → submitting (se arma y envía a WHCC)
//   → in_production (WHCC lo aceptó) → shipped (con seguimiento; se paga al
//   fotógrafo) · o bien refunded/canceled/failed.
// Cada paso es idempotente: los webhooks y el cron pueden repetirse.

const LAB_IMAGE_TTL_SECONDS = 7 * 24 * 60 * 60; // máximo de R2; WHCC pide 7 días
const STUCK_AFTER_MS = 10 * 60 * 1000;

function admin() {
  return createAdminClient();
}

async function loadOrder(orderId: string) {
  const db = admin();
  const { data: order } = await db.from("print_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return null;
  const { data: items } = await db.from("print_order_items").select("*").eq("order_id", orderId).order("created_at");
  return { order, items: items ?? [] };
}

// ---------------------------------------------------------------------------
// Pago confirmado
// ---------------------------------------------------------------------------

/** checkout.session.completed de un pedido de impresiones. Devuelve el id si hay que enviarlo al laboratorio. */
export async function markOrderPaid(session: Stripe.Checkout.Session): Promise<string | null> {
  const orderId = session.metadata?.order_id;
  if (!orderId || session.payment_status !== "paid") return null;
  const db = admin();
  const loaded = await loadOrder(orderId);
  if (!loaded) return null;
  const { order, items } = loaded;
  if (order.status !== "pending_payment") return order.status === "paid" ? order.id : null;

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  let chargeId: string | null = null;
  let processingFee = 0;
  if (paymentIntentId) {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = pi.latest_charge as Stripe.Charge | null;
    chargeId = charge?.id ?? null;
    const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
    processingFee = bt && typeof bt === "object" ? bt.fee : 0;
  }

  // El envío se cobra al costo y va al laboratorio: el margen es solo sobre productos.
  const markup = order.subtotal_cents - order.lab_cost_cents;
  const { platformFeeCents, creatorEarningsCents } = settle(markup, order.platform_fee_percent, processingFee);

  const { data: updated } = await db
    .from("print_orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      tax_cents: session.total_details?.amount_tax ?? 0,
      total_cents: session.amount_total ?? order.subtotal_cents + order.shipping_cents,
      processing_fee_cents: processingFee,
      platform_fee_cents: platformFeeCents,
      creator_earnings_cents: creatorEarningsCents,
    })
    .eq("id", order.id)
    .eq("status", "pending_payment")
    .select("*")
    .maybeSingle();
  if (!updated) return null; // otro proceso ya lo marcó

  await notifyPaid(updated, items).catch((e) => console.error("[store] correos de pedido pagado", e));
  return updated.id;
}

async function notifyPaid(order: PrintOrderRow, items: { product_name: string; size_label: string; quantity: number; unit_price_cents: number }[]) {
  const db = admin();
  const { data: creator } = await db.from("creators").select("*").eq("id", order.creator_id).single();
  const { data: project } = order.project_id
    ? await db.from("projects").select("title").eq("id", order.project_id).maybeSingle()
    : { data: null };
  await sendPrintOrderConfirmation({
    to: order.buyer_email,
    buyerName: order.buyer_name,
    businessName: creator?.business_name ?? "",
    reference: order.reference,
    lines: items.map((i) => ({ name: `${i.product_name} ${i.size_label}`, quantity: i.quantity, priceLabel: formatUsd(i.unit_price_cents * i.quantity) })),
    totalLabel: formatUsd(order.total_cents),
    orderLink: orderUrl(order.id),
    locale: order.locale,
  });
  if (creator) {
    const to = await creatorEmail(creator);
    if (to) {
      await sendNewSaleToCreator({
        to,
        businessName: creator.business_name,
        reference: order.reference,
        galleryTitle: project?.title ?? null,
        totalLabel: formatUsd(order.total_cents),
        earningsLabel: formatUsd(order.creator_earnings_cents),
        locale: creator.locale,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Envío al laboratorio
// ---------------------------------------------------------------------------

/**
 * Arma los productos con las fotos originales, espera a que WHCC las procese
 * y envía el pedido. Seguro de repetir: reutiliza lo ya armado y la clave de
 * idempotencia del envío es el id del pedido.
 */
export async function fulfillOrder(orderId: string): Promise<void> {
  const db = admin();
  // Reclamar el pedido (un solo proceso a la vez).
  const now = new Date();
  const { data: claimed } = await db
    .from("print_orders")
    .update({ status: "submitting" })
    .eq("id", orderId)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (!claimed) {
    const { data: stuck } = await db
      .from("print_orders")
      .update({ updated_at: now.toISOString() })
      .eq("id", orderId)
      .eq("status", "submitting")
      .lt("updated_at", new Date(now.getTime() - STUCK_AFTER_MS).toISOString())
      .select("id")
      .maybeSingle();
    if (!stuck) return;
  }

  const loaded = await loadOrder(orderId);
  if (!loaded) return;
  const { order, items } = loaded;

  try {
    if (!order.lab_submission_id) {
      // 1. Armar las fotos impresas que falten. Los diseños del editor
      //    (photobooks, tarjetas) ya vienen armados y revisados al pagar.
      const toBuild = items.filter((i) => !i.lab_configured_product_id && !i.editor_item_id);
      if (items.some((i) => !i.lab_configured_product_id && i.editor_item_id)) {
        return failOrder(order.id, "Falta el diseño de un producto personalizado.");
      }
      if (toBuild.length > 0) {
        const assetIds = toBuild.map((i) => i.asset_id).filter((x): x is string => Boolean(x));
        const { data: assets } = await db.from("assets").select("id, r2_key").in("id", assetIds);
        const keyOf = new Map((assets ?? []).map((a) => [a.id, a.r2_key]));
        const lines = [];
        for (const item of toBuild) {
          const key = item.asset_id ? keyOf.get(item.asset_id) : undefined;
          if (!key) return failOrder(order.id, `La foto ${item.file_name} ya no existe.`);
          lines.push({
            productRef: String(item.selections.__product_ref ?? ""),
            selections: stripMeta(item.selections),
            quantity: item.quantity,
            imageUrl: await signDownloadUrl(key, { expiresIn: LAB_IMAGE_TTL_SECONDS }),
          });
        }
        const ids = await buildOrderItems(lines);
        await Promise.all(toBuild.map((item, i) => db.from("print_order_items").update({ lab_configured_product_id: ids[i] }).eq("id", item.id)));
        toBuild.forEach((item, i) => (item.lab_configured_product_id = ids[i]));
      }

      // 2. Esperar a que WHCC procese las imágenes de las fotos impresas
      const photoIds = items.filter((i) => !i.editor_item_id).map((i) => i.lab_configured_product_id as string);
      if (photoIds.length > 0) {
        const status = await waitForItems(photoIds);
        if (status.failed.length > 0) {
          const bad = items.find((i) => i.lab_configured_product_id === status.failed[0].id);
          return failOrder(order.id, `El laboratorio no pudo procesar ${bad?.file_name ?? "una foto"}: ${status.failed[0].message}`);
        }
        if (!status.ready) return; // sigue en "submitting"; el cron lo reintenta
      }

      // 3. Enviar
      const submission = await submitOrder({
        orderId: order.id,
        reference: order.reference,
        items: items.map((i) => ({ configuredProductId: i.lab_configured_product_id as string, quantity: i.quantity })),
        address: order.shipping_address,
      });
      order.lab_submission_id = submission.id;
      await db.from("print_orders").update({ lab_submission_id: submission.id, submitted_at: new Date().toISOString() }).eq("id", order.id);
    }

    // 4. Confirmar que se convirtió en pedido(s) de WHCC
    await reconcileSubmission(order.id, order.lab_submission_id as string);
  } catch (err) {
    console.error(`[store] Error enviando ${order.reference} al laboratorio`, err);
    // Un 400 no se arregla reintentando; lo demás queda para el cron.
    if (err instanceof WhccError && err.status === 400) {
      return failOrder(order.id, `El laboratorio rechazó el pedido: ${err.message}`);
    }
  }
}

function stripMeta(selections: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(selections)) {
    if (k.startsWith("__")) continue;
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return out;
}

/** Lee la submission hasta que se asienta (unos segundos) y actualiza el pedido. */
export async function reconcileSubmission(orderId: string, submissionId: string, attempts = 6): Promise<void> {
  const db = admin();
  for (let i = 0; i < attempts; i++) {
    const sub = await getSubmission(submissionId);
    if (sub.status === "staged" || sub.status === "submitting") {
      await new Promise((r) => setTimeout(r, 3000 + i * 2000));
      continue;
    }
    const confirmationIds = (sub.orders ?? []).map((o) => o.confirmationId).filter(Boolean);
    if (sub.status === "failed") {
      const reason = sub.orders?.find((o) => o.failure)?.failure?.message ?? "El laboratorio no pudo colocar el pedido.";
      await db.from("print_orders").update({ lab_confirmation_ids: confirmationIds }).eq("id", orderId);
      return failOrder(orderId, reason);
    }
    const patch: Partial<PrintOrderRow> = { lab_confirmation_ids: confirmationIds };
    if (sub.status === "partially_failed") {
      patch.failure_reason = "Parte del pedido no se pudo colocar en el laboratorio; revisar con WHCC.";
    }
    await db.from("print_orders").update({ ...patch, status: "in_production" }).eq("id", orderId).eq("status", "submitting");
    return;
  }
}

// ---------------------------------------------------------------------------
// Fallas y reembolsos
// ---------------------------------------------------------------------------

/** Marca el pedido con problemas y, si nada se envió, reembolsa el total. */
export async function failOrder(orderId: string, reason: string, finalStatus: "refunded" | "canceled" = "refunded"): Promise<void> {
  const db = admin();
  const { data: order } = await db.from("print_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || ["refunded", "canceled", "shipped"].includes(order.status)) return;

  let refunded = false;
  if (order.stripe_payment_intent_id && !order.stripe_transfer_id) {
    try {
      await stripe().refunds.create(
        { payment_intent: order.stripe_payment_intent_id, metadata: { order_id: order.id, reason: reason.slice(0, 400) } },
        { idempotencyKey: `print-refund-${order.id}` },
      );
      refunded = true;
    } catch (err) {
      console.error(`[store] No se pudo reembolsar ${order.reference}`, err);
    }
  }
  await db
    .from("print_orders")
    .update({ status: refunded ? finalStatus : "failed", failure_reason: reason.slice(0, 1000) })
    .eq("id", order.id);
  await sendPrintOrderProblem({
    to: order.buyer_email,
    buyerName: order.buyer_name,
    reference: order.reference,
    refunded,
    orderLink: orderUrl(order.id),
    locale: order.locale,
  }).catch((e) => console.error("[store] correo de problema", e));
}

// ---------------------------------------------------------------------------
// Pago al fotógrafo
// ---------------------------------------------------------------------------

export async function transferEarnings(orderId: string): Promise<void> {
  const db = admin();
  const { data: order } = await db.from("print_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.stripe_transfer_id || order.creator_earnings_cents <= 0 || !order.stripe_charge_id) return;
  const { data: creator } = await db
    .from("creators")
    .select("stripe_connect_account_id, connect_payouts_enabled")
    .eq("id", order.creator_id)
    .single();
  if (!creator?.stripe_connect_account_id) return;
  const transfer = await stripe().transfers.create(
    {
      amount: order.creator_earnings_cents,
      currency: "usd",
      destination: creator.stripe_connect_account_id,
      source_transaction: order.stripe_charge_id,
      transfer_group: order.id,
      description: `Ganancia del pedido ${order.reference}`,
      metadata: { order_id: order.id },
    },
    { idempotencyKey: `print-transfer-${order.id}` },
  );
  await db.from("print_orders").update({ stripe_transfer_id: transfer.id }).eq("id", order.id);
}

// ---------------------------------------------------------------------------
// Eventos del laboratorio
// ---------------------------------------------------------------------------

export async function applyLabEvent(ev: WhccEvent): Promise<void> {
  const db = admin();
  let order: PrintOrderRow | null = null;
  if (ev.reference) {
    order = (await db.from("print_orders").select("*").eq("reference", ev.reference).maybeSingle()).data;
  }
  if (!order && ev.confirmationId) {
    order = (await db.from("print_orders").select("*").contains("lab_confirmation_ids", [ev.confirmationId]).maybeSingle()).data;
  }
  if (!order) {
    console.warn(`[store] Evento ${ev.eventType} sin pedido (${ev.reference ?? ev.confirmationId})`);
    return;
  }

  if (ev.confirmationId && !order.lab_confirmation_ids.includes(ev.confirmationId)) {
    await db
      .from("print_orders")
      .update({ lab_confirmation_ids: [...order.lab_confirmation_ids, ev.confirmationId] })
      .eq("id", order.id);
  }

  switch (ev.eventType) {
    case "order.accepted": {
      await db.from("print_orders").update({ status: "in_production" }).eq("id", order.id).in("status", ["paid", "submitting"]);
      return;
    }
    case "order.rejected": {
      if (order.status === "shipped") {
        await db.from("print_orders").update({ failure_reason: `Parte del pedido fue rechazada: ${ev.errors.join("; ")}` }).eq("id", order.id);
        return;
      }
      return failOrder(order.id, `El laboratorio rechazó el pedido: ${ev.errors.join("; ") || "sin detalle"}`);
    }
    case "order.cancelled": {
      if (order.status === "shipped") return;
      return failOrder(order.id, "El pedido fue cancelado en el laboratorio.", "canceled");
    }
    case "order.shipped": {
      const newTracking: TrackingInfo[] = ev.shipping.map((s) => ({
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl,
        shipDate: s.shipDate,
      }));
      const known = new Set(order.tracking.map((t) => t.trackingNumber));
      const added = newTracking.filter((t) => !known.has(t.trackingNumber));
      await db
        .from("print_orders")
        .update({
          status: "shipped",
          shipped_at: order.shipped_at ?? new Date().toISOString(),
          tracking: [...order.tracking, ...added],
        })
        .eq("id", order.id);
      if (added.length > 0) {
        await sendPrintOrderShipped({
          to: order.buyer_email,
          buyerName: order.buyer_name,
          reference: order.reference,
          tracking: added,
          orderLink: orderUrl(order.id),
          locale: order.locale,
        }).catch((e) => console.error("[store] correo de envío", e));
      }
      await transferEarnings(order.id);
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Mantenimiento (cron diario)
// ---------------------------------------------------------------------------

/** Reintenta pedidos pagados que no llegaron al laboratorio y vence carritos sin pagar. */
export async function maintainPrintOrders(): Promise<{ retried: number; expired: number }> {
  const db = admin();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { data: pending } = await db
    .from("print_orders")
    .select("id")
    .in("status", ["paid", "submitting"])
    .lt("updated_at", cutoff)
    .limit(20);
  for (const o of pending ?? []) await fulfillOrder(o.id);

  const { data: expired } = await db
    .from("print_orders")
    .update({ status: "canceled", failure_reason: "Pago no completado" })
    .eq("status", "pending_payment")
    .lt("created_at", new Date(Date.now() - 2 * 86_400_000).toISOString())
    .select("id");
  return { retried: pending?.length ?? 0, expired: expired?.length ?? 0 };
}
