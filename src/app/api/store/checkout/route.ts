import { getI18n } from "@/i18n/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { calculateItems, LAB_ID, WhccError } from "@/lib/labs/whcc";
import { normalizeQuantity } from "@/lib/print-offerings";
import { PLANS } from "@/lib/plans";
import { quoteOrder, retailPriceCents, shippingCentsFor } from "@/lib/print-pricing";
import { stripe } from "@/lib/stripe";
import { getStoreAccess, loadStoreProducts, newOrderReference, orderUrl } from "@/lib/store";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, US_STATES, isPrintable } from "@/lib/store-types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_CODES = new Set(US_STATES.map(([code]) => code));

const body = (a: { stateUnavailable: string; invalidZip: string }) => z.object({
  projectId: z.uuid(),
  items: z
    .array(
      z.union([
        z.object({ productId: z.uuid(), assetId: z.uuid(), quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) }),
        // Diseño del editor (photobook o tarjetas: hasta 5000 tarjetas).
        z.object({ productId: z.uuid(), editorItemId: z.uuid(), quantity: z.number().int().min(1).max(5000) }),
      ]),
    )
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
    state: z.string().refine((s) => STATE_CODES.has(s), a.stateUnavailable),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, a.invalidZip),
  }),
});

/**
 * Crea el pedido (pendiente de pago) con precios calculados en el servidor y
 * devuelve la URL de Stripe Checkout. El navegador solo envía ids y cantidades.
 */
export async function POST(req: NextRequest) {
  const { t, locale } = await getI18n();
  const a = t.api;
  const parsed = body(a).safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? a.invalidData }, { status: 400 });
  }
  const { projectId, items, buyer, address } = parsed.data;

  const access = await getStoreAccess(projectId);
  if (!access) return NextResponse.json({ error: a.storeUnavailable }, { status: 403 });

  const admin = createAdminClient();
  const products = new Map((await loadStoreProducts(admin, access.creator)).map((p) => [p.id, p]));

  // Líneas normalizadas: precio y costo siempre calculados aquí.
  type Line = {
    productId: string;
    name: string;
    sizeLabel: string;
    detail: string;
    categoryRef: string;
    quantity: number;
    unitPriceCents: number;
    unitCostCents: number;
    selections: Record<string, unknown>;
    assetId: string | null;
    editorItemId: string | null;
    configuredProductId: string | null;
  };
  const lines: Line[] = [];

  // 1. Fotos impresas (impresiones y canvas)
  const photoItems = items.filter((i): i is Extract<typeof i, { assetId: string }> => "assetId" in i);
  const { data: assets } = photoItems.length
    ? await admin
        .from("assets")
        .select("id, kind, file_name, size_bytes")
        .in("id", [...new Set(photoItems.map((i) => i.assetId))])
        .eq("project_id", projectId)
        .eq("upload_status", "complete")
    : { data: [] };
  const assetById = new Map((assets ?? []).map((a) => [a.id, a]));
  for (const item of photoItems) {
    const product = products.get(item.productId);
    const asset = assetById.get(item.assetId);
    if (!product || !asset || product.completion !== "api") {
      return NextResponse.json({ error: a.itemUnavailable }, { status: 409 });
    }
    if (!isPrintable({ ...asset, size_bytes: Number(asset.size_bytes) })) {
      return NextResponse.json({ error: a.notPrintable(asset.file_name) }, { status: 409 });
    }
    lines.push({
      productId: product.id,
      name: product.productName,
      sizeLabel: product.sizeLabel,
      detail: asset.file_name,
      categoryRef: product.categoryRef,
      quantity: item.quantity,
      unitPriceCents: product.priceCents,
      unitCostCents: product.costCents,
      selections: { ...product.selections, __product_ref: product.productRef },
      assetId: asset.id,
      editorItemId: null,
      configuredProductId: null,
    });
  }

  // 2. Diseños del editor (photobooks y tarjetas): deben estar terminados; el
  //    costo real (páginas, cantidad) lo da WHCC.
  const designItems = items.filter((i): i is Extract<typeof i, { editorItemId: string }> => "editorItemId" in i);
  let designShippingCents = 0;
  if (designItems.length > 0) {
    const { data: rows } = await admin
      .from("print_editor_items")
      .select("id, product_id, configured_product_id, finished")
      .in("id", designItems.map((i) => i.editorItemId))
      .eq("project_id", projectId);
    const rowById = new Map((rows ?? []).map((r) => [r.id, r]));
    const toQuote: { configuredProductId: string; quantity: number }[] = [];
    const pendingDesigns: { item: (typeof designItems)[number]; product: NonNullable<ReturnType<typeof products.get>>; configuredProductId: string; quantity: number }[] = [];
    for (const item of designItems) {
      const row = rowById.get(item.editorItemId);
      const product = products.get(item.productId);
      if (!row || !product || row.product_id !== product.id || product.completion !== "editor") {
        return NextResponse.json({ error: a.designUnavailable }, { status: 409 });
      }
      if (!row.finished) {
        return NextResponse.json({ error: a.finishDesign(product.productName) }, { status: 409 });
      }
      const quantity =
        product.kind === "card" ? normalizeQuantity(item.quantity, product.minQuantity, product.quantityStep) : Math.min(10, item.quantity);
      toQuote.push({ configuredProductId: row.configured_product_id, quantity });
      pendingDesigns.push({ item, product, configuredProductId: row.configured_product_id, quantity });
    }
    let quoted: Awaited<ReturnType<typeof calculateItems>>;
    try {
      quoted = await calculateItems(toQuote, {
        name: buyer.name,
        addr1: address.addr1,
        ...(address.addr2 ? { addr2: address.addr2 } : {}),
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: "US",
      });
    } catch (err) {
      console.error("[store] calculate", err);
      const msg = err instanceof WhccError && err.status === 400 ? a.checkAddress : a.quoteFailed;
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const byConfigured = new Map(quoted.items.map((q) => [q.configuredProductId, q]));
    for (const d of pendingDesigns) {
      const q = byConfigured.get(d.configuredProductId);
      if (!q || !q.isValidForOrder || q.unitPriceCents <= 0) {
        return NextResponse.json({ error: a.designNeedsReview(d.product.productName) }, { status: 409 });
      }
      lines.push({
        productId: d.product.id,
        name: d.product.productName,
        sizeLabel: d.product.sizeLabel,
        detail: d.product.kind === "card" ? a.customCards : a.customDesign,
        categoryRef: d.product.categoryRef,
        quantity: d.quantity,
        unitPriceCents: retailPriceCents(q.unitPriceCents, d.product.markupPercent),
        unitCostCents: q.unitPriceCents,
        selections: { __product_ref: d.product.productRef, __editor: true },
        assetId: null,
        editorItemId: d.item.editorItemId,
        configuredProductId: d.configuredProductId,
      });
    }
    designShippingCents = quoted.shippingCents ?? designItems.length * shippingCentsFor(1);
  }

  const photoGroups = new Set(lines.filter((l) => !l.editorItemId).map((l) => l.categoryRef)).size;
  const groups = photoGroups + designItems.length;
  const shippingCents = shippingCentsFor(photoGroups) + designShippingCents;
  const quote = quoteOrder(
    lines.map((l) => ({ unitPriceCents: l.unitPriceCents, unitCostCents: l.unitCostCents, quantity: l.quantity })),
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
        locale,
      })
      .select("id, reference")
      .single();
    if (error && error.code !== "23505") throw error;
    order = data;
  }
  if (!order) return NextResponse.json({ error: a.orderFailed }, { status: 500 });

  const { error: itemsError } = await admin.from("print_order_items").insert(
    lines.map((l) => ({
      order_id: order.id,
      creator_id: access.creator.id,
      product_id: l.productId,
      asset_id: l.assetId,
      editor_item_id: l.editorItemId,
      lab_configured_product_id: l.configuredProductId,
      product_name: l.name,
      size_label: l.sizeLabel,
      file_name: l.detail,
      selections: l.selections,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents,
      unit_cost_cents: l.unitCostCents,
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
        quantity: l.quantity,
        price_data: {
          currency: "usd",
          unit_amount: l.unitPriceCents,
          product_data: {
            name: `${l.name} ${l.sizeLabel}`,
            description: l.detail,
          },
          ...(taxEnabled ? { tax_behavior: "exclusive" as const } : {}),
        },
      })),
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingCents, currency: "usd" },
            display_name: a.shipping(groups),
            delivery_estimate: { minimum: { unit: "business_day", value: 5 }, maximum: { unit: "business_day", value: 12 } },
            ...(taxEnabled ? { tax_behavior: "exclusive" as const } : {}),
          },
        },
      ],
      ...(taxEnabled ? { automatic_tax: { enabled: true } } : {}),
      metadata: { kind: "print_order", order_id: order.id, reference: order.reference },
      payment_intent_data: {
        transfer_group: order.id,
        description: a.paymentDescription(order.reference, access.creator.business_name),
        metadata: { kind: "print_order", order_id: order.id },
      },
      success_url: `${orderUrl(order.id)}&pagado=1`,
      cancel_url: appUrl(`/tienda/${projectId}`),
      locale: locale === "es" ? "es" : "en",
    },
    { idempotencyKey: `print-checkout-${order.id}` },
  );

  await admin.from("print_orders").update({ stripe_checkout_session_id: session.id }).eq("id", order.id);
  return NextResponse.json({ url: session.url });
}
