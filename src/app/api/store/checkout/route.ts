import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { LAB_ID } from "@/lib/labs/whcc";
import { PLANS } from "@/lib/plans";
import { quoteOrder, shippingCentsFor } from "@/lib/print-pricing";
import { stripe } from "@/lib/stripe";
import { getStoreAccess, loadStoreProducts, newOrderReference, orderUrl } from "@/lib/store";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, US_STATES, isPrintable } from "@/lib/store-types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_CODES = new Set(US_STATES.map(([code]) => code));

const Body = z.object({
  projectId: z.uuid(),
  items: z
    .array(z.object({ productId: z.uuid(), assetId: z.uuid(), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) }))
    .min(1)
    .max(MAX_CART_LINES),
  buyer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
  }),
  address: z.object({
    addr1: z.string().trim().min(3).max(100),
    addr2: z.string().trim().max(100).optional().default(""),
    city: z.string().trim().min(2).max(60),
    state: z.string().refine((s) => STATE_CODES.has(s), "Estado no disponible"),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Código postal inválido"),
  }),
});

/**
 * Crea el pedido (pendiente de pago) con precios calculados en el servidor y
 * devuelve la URL de Stripe Checkout. El navegador solo envía ids y cantidades.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { projectId, items, buyer, address } = parsed.data;

  const access = await getStoreAccess(projectId);
  if (!access) return NextResponse.json({ error: "La tienda de esta galería no está disponible." }, { status: 403 });

  const admin = createAdminClient();
  const products = new Map((await loadStoreProducts(admin, access.creator)).map((p) => [p.id, p]));
  const assetIds = [...new Set(items.map((i) => i.assetId))];
  const { data: assets } = await admin
    .from("assets")
    .select("id, kind, file_name, size_bytes")
    .in("id", assetIds)
    .eq("project_id", projectId)
    .eq("upload_status", "complete");
  const assetById = new Map((assets ?? []).map((a) => [a.id, a]));

  const lines = [];
  for (const item of items) {
    const product = products.get(item.productId);
    const asset = assetById.get(item.assetId);
    if (!product || !asset) return NextResponse.json({ error: "Un producto o una foto del carrito ya no está disponible." }, { status: 409 });
    if (!isPrintable({ ...asset, size_bytes: Number(asset.size_bytes) })) {
      return NextResponse.json({ error: `La foto ${asset.file_name} no se puede imprimir.` }, { status: 409 });
    }
    lines.push({ item, product, asset });
  }

  const groups = new Set(lines.map((l) => l.product.categoryRef)).size;
  const shippingCents = shippingCentsFor(groups);
  const quote = quoteOrder(
    lines.map((l) => ({ unitPriceCents: l.product.priceCents, unitCostCents: l.product.costCents, quantity: l.item.quantity })),
    shippingCents,
  );

  const shippingAddress = {
    name: buyer.name,
    addr1: address.addr1,
    ...(address.addr2 ? { addr2: address.addr2 } : {}),
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: "US" as const,
  };

  // Pedido pendiente (la referencia es única; se reintenta en el raro caso de choque).
  let order: { id: string; reference: string } | null = null;
  for (let attempt = 0; attempt < 3 && !order; attempt++) {
    const { data, error } = await admin
      .from("print_orders")
      .insert({
        reference: newOrderReference(),
        creator_id: access.creator.id,
        project_id: projectId,
        buyer_email: buyer.email.toLowerCase(),
        buyer_name: buyer.name,
        buyer_user_id: access.buyer?.userId ?? null,
        shipping_address: shippingAddress,
        subtotal_cents: quote.subtotalCents,
        shipping_cents: quote.shippingCents,
        lab_cost_cents: quote.labProductCostCents,
        platform_fee_percent: PLANS[access.creator.plan].storeFeePercent,
        lab: LAB_ID,
      })
      .select("id, reference")
      .single();
    if (error && error.code !== "23505") throw error;
    order = data;
  }
  if (!order) return NextResponse.json({ error: "No se pudo crear el pedido." }, { status: 500 });

  const { error: itemsError } = await admin.from("print_order_items").insert(
    lines.map((l) => ({
      order_id: order.id,
      creator_id: access.creator.id,
      product_id: l.product.id,
      asset_id: l.asset.id,
      product_name: l.product.productName,
      size_label: l.product.sizeLabel,
      file_name: l.asset.file_name,
      selections: { ...l.product.selections, __product_ref: l.product.productRef },
      quantity: l.item.quantity,
      unit_price_cents: l.product.priceCents,
      unit_cost_cents: l.product.costCents,
    })),
  );
  if (itemsError) throw itemsError;

  // Impuesto de ventas con Stripe Tax (requiere activarlo en Stripe).
  const taxEnabled = process.env.STRIPE_TAX_ENABLED === "true";
  let customer: string | undefined;
  if (taxEnabled) {
    const stripeAddress = {
      line1: address.addr1,
      line2: address.addr2 || undefined,
      city: address.city,
      state: address.state,
      postal_code: address.zip,
      country: "US",
    };
    const c = await stripe().customers.create({
      email: buyer.email,
      name: buyer.name,
      address: stripeAddress,
      shipping: { name: buyer.name, address: stripeAddress },
      metadata: { print_order_id: order.id },
    });
    customer = c.id;
  }

  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      ...(customer ? { customer } : { customer_email: buyer.email }),
      line_items: lines.map((l) => ({
        quantity: l.item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: l.product.priceCents,
          product_data: {
            name: `${l.product.productName} ${l.product.sizeLabel}`,
            description: l.asset.file_name,
          },
          ...(taxEnabled ? { tax_behavior: "exclusive" as const } : {}),
        },
      })),
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingCents, currency: "usd" },
            display_name: groups > 1 ? `Envío económico (${groups} paquetes)` : "Envío económico",
            delivery_estimate: { minimum: { unit: "business_day", value: 5 }, maximum: { unit: "business_day", value: 12 } },
            ...(taxEnabled ? { tax_behavior: "exclusive" as const } : {}),
          },
        },
      ],
      ...(taxEnabled ? { automatic_tax: { enabled: true } } : {}),
      metadata: { kind: "print_order", order_id: order.id, reference: order.reference },
      payment_intent_data: {
        transfer_group: order.id,
        description: `Impresiones ${order.reference} · ${access.creator.business_name}`,
        metadata: { kind: "print_order", order_id: order.id },
      },
      success_url: `${orderUrl(order.id)}&pagado=1`,
      cancel_url: appUrl(`/tienda/${projectId}`),
      locale: "es",
    },
    { idempotencyKey: `print-checkout-${order.id}` },
  );

  await admin.from("print_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
  return NextResponse.json({ url: session.url });
}
