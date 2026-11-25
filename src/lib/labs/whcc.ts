import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";
import { resolveSelections, type Selections, type WhccField } from "@/lib/labs/whcc-selections";
import { KIND_LABEL, OFFERINGS, type OfferingKind } from "@/lib/print-offerings";
import type { ShippingAddress } from "@/types/database";

// Cliente de la WHCC API (https://www.whcc.com/developer/docs/).
//  * Pruebas: https://apis-stage.whcc.com/api (nada se produce ni se cobra).
//  * Producción: https://apis.whcc.com/api (cada pedido es real y se cobra).
// La llave va como Bearer; todas las peticiones llevan WHCC-API-Version.

export const WHCC_API_VERSION = "2026-10";
export const LAB_ID = "whcc";

/** Imagen pública de prueba de la documentación de WHCC, usada para cotizar el catálogo. */
const DEFAULT_SAMPLE_IMAGE =
  "https://whcc-platform-test-assets.s3.us-east-2.amazonaws.com/0dd4751480afa9ec95e01c04acdd376f_2509_3357.jpg";

export function whccConfigured(): boolean {
  return Boolean(process.env.WHCC_API_KEY);
}

function baseUrl(): string {
  const live = process.env.WHCC_ENV === "live";
  if (live && process.env.WHCC_ALLOW_LIVE !== "true") {
    // Protección: no enviar pedidos reales sin confirmación explícita.
    throw new Error("WHCC_ENV=live sin WHCC_ALLOW_LIVE=true. Abortando.");
  }
  return live ? "https://apis.whcc.com/api" : "https://apis-stage.whcc.com/api";
}

export class WhccError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function whcc<T>(pathOrUrl: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${baseUrl()}${pathOrUrl}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireEnv("WHCC_API_KEY")}`,
    "WHCC-API-Version": WHCC_API_VERSION,
    Accept: "application/json",
  };
  if (init.body) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const b = body as { title?: string; detail?: string; message?: string; code?: string } | null;
    const detail = b?.detail ?? b?.title ?? b?.message ?? (typeof body === "string" ? body.slice(0, 200) : "");
    throw new WhccError(`WHCC ${res.status}${b?.code ? ` ${b.code}` : ""}: ${detail}`, res.status, body);
  }
  return body as T;
}

type Money = { value: string; code: string };

export function moneyToCents(m: Money | undefined | null): number {
  if (!m) return 0;
  const n = Number.parseFloat(String(m.value));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// ---------------------------------------------------------------------------
// Catálogo (curado: ver src/lib/print-offerings.ts)
// ---------------------------------------------------------------------------

type CatalogDetail = {
  ref: string;
  name: string;
  completion: "api" | "editor";
  description?: string;
  category: { ref: string; name: string };
  resolution?: number;
  sizedBy?: string[];
  quantity?: { min?: number; max?: number; step?: number; default?: number };
  configuration?: { fields: WhccField[] };
};

export interface CatalogVariant {
  product_ref: string;
  product_name: string;
  category_ref: string;
  category_name: string;
  size_id: string;
  size_label: string;
  width_in: number | null;
  height_in: number | null;
  selections: Selections;
  cost_cents: number;
  resolution: number | null;
  description: string | null;
  sort: number;
  completion: "api" | "editor";
  kind: OfferingKind;
  min_quantity: number;
  quantity_step: number;
}

type BuildItem = {
  configuredProductId: string;
  status: "processing" | "ready" | "failed" | "not-found" | "awaiting-editor";
  unitPrice?: Money;
  validationSummary?: { id: number; level: string; message: string }[];
};

type BuildEntry = { productId: string; selections: Selections; images?: { url: string }[]; designId?: string };

async function buildConfigured(entries: BuildEntry[]) {
  return whcc<{ items: BuildItem[]; actions?: { poll?: { url: string } } }>("/v1/commerce/configured-products", {
    method: "POST",
    body: JSON.stringify({ configuredProducts: entries }),
  });
}

/**
 * Lee del laboratorio los productos del catálogo curado y su costo mayorista.
 * WHCC solo da el precio al "armar" un producto, así que se arma cada
 * producto/tamaño de muestra y se guarda su precio unitario:
 *  * impresiones y canvas: con una imagen de prueba (lotes de 50);
 *  * photobooks: con la talla (precio con las páginas mínimas, "desde");
 *  * tarjetas: con el primer diseño disponible (precio por tarjeta).
 */
export async function fetchCatalog(): Promise<CatalogVariant[]> {
  const sample = process.env.WHCC_SAMPLE_IMAGE_URL || DEFAULT_SAMPLE_IMAGE;
  const pending: { variant: Omit<CatalogVariant, "cost_cents">; entry: BuildEntry }[] = [];
  let sort = 0;

  for (const offer of OFFERINGS) {
    const detail = await whcc<CatalogDetail>(`/v1/catalog/products/${encodeURIComponent(offer.ref)}`).catch((err) => {
      if (err instanceof WhccError && err.status === 404) return null; // no disponible en este entorno
      throw err;
    });
    if (!detail) continue;
    const fields = detail.configuration?.fields ?? [];
    const base = {
      product_ref: offer.ref,
      product_name: offer.label,
      category_ref: detail.category.ref,
      category_name: KIND_LABEL[offer.kind],
      resolution: detail.resolution ?? null,
      description: offer.description,
      completion: offer.completion,
      kind: offer.kind,
      min_quantity: detail.quantity?.min ?? 1,
      quantity_step: detail.quantity?.step ?? 1,
    };

    if (offer.kind === "card") {
      const designs = await listCardDesigns({ productRefs: [offer.ref], tag: "holiday", limit: 1 });
      const design = designs.designs[0];
      if (!design) continue;
      pending.push({
        variant: { ...base, size_id: "5x7", size_label: "5×7", width_in: 5, height_in: 7, selections: {}, sort: sort++ },
        entry: { productId: offer.ref, designId: design.id, selections: { quantity: base.min_quantity } },
      });
      continue;
    }

    const sizeField = fields.find((f) => f.field === (detail.sizedBy?.[0] ?? "size") && f.kind === "enum");
    const sizeValues = (sizeField?.values ?? []).filter(
      (v) => v.enabled !== false && v.id !== "custom" && (!offer.sizes || offer.sizes.includes(v.id)),
    );
    // Respeta el orden de la lista curada.
    if (offer.sizes) sizeValues.sort((a, b) => offer.sizes!.indexOf(a.id) - offer.sizes!.indexOf(b.id));

    for (const size of sizeValues) {
      if (offer.completion === "api") {
        const selections = resolveSelections(fields, { [sizeField!.field]: size.id, ...(offer.selections ?? {}) });
        if (!selections) continue;
        pending.push({
          variant: {
            ...base,
            size_id: size.id,
            size_label: size.name ?? size.id,
            width_in: size.width ?? null,
            height_in: size.height ?? null,
            selections,
            sort: sort++,
          },
          entry: { productId: offer.ref, selections, images: [{ url: sample }] },
        });
      } else {
        // Libros: solo la talla; el resto lo pone WHCC por defecto o el cliente en el editor.
        const selections = { [sizeField!.field]: size.id };
        pending.push({
          variant: {
            ...base,
            size_id: size.id,
            size_label: bookSizeLabel(size.id, size.name),
            width_in: size.width ?? null,
            height_in: size.height ?? null,
            selections,
            sort: sort++,
          },
          entry: { productId: offer.ref, selections },
        });
      }
    }
  }

  const priced: CatalogVariant[] = [];
  const priceBatch = async (batch: typeof pending) => {
    const res = await buildConfigured(batch.map((b) => b.entry));
    res.items.forEach((item, i) => {
      const cost = moneyToCents(item.unitPrice);
      if (cost > 0 && item.status !== "failed") priced.push({ ...batch[i].variant, cost_cents: cost });
    });
  };
  // WHCC no deja mezclar productos simples y de editor en una misma llamada,
  // y admite hasta 50 simples o 20 de editor por llamada.
  for (const completion of ["api", "editor"] as const) {
    const group = pending.filter((p) => p.variant.completion === completion);
    const size = completion === "api" ? 50 : 20;
    for (let i = 0; i < group.length; i += size) {
      const batch = group.slice(i, i + size);
      try {
        await priceBatch(batch);
      } catch (err) {
        // Una combinación inválida rechaza el lote entero: se cotiza de a uno y
        // se descartan las que WHCC no acepta.
        if (!(err instanceof WhccError) || err.status !== 400) throw err;
        for (const one of batch) {
          try {
            await priceBatch([one]);
          } catch (e) {
            if (!(e instanceof WhccError) || e.status !== 400) throw e;
            console.warn(`[whcc] Combinación descartada ${one.variant.product_ref} ${one.variant.size_id}: ${e.message}`);
          }
        }
      }
    }
  }
  return priced;
}

/** "7x5" → "7×5 horizontal", "5x7" → "5×7 vertical", "8x8" → "8×8 cuadrado". */
export function bookSizeLabel(id: string, fallback?: string): string {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(id);
  if (!m) return fallback ?? id;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return `${m[1]}×${m[2]} ${w > h ? "horizontal" : w < h ? "vertical" : "cuadrado"}`;
}

// ---------------------------------------------------------------------------
// Diseños de tarjetas
// ---------------------------------------------------------------------------

export interface CardDesign {
  id: string;
  name: string;
  subtitle: string;
  productRefs: string[];
  previewUrl: string | null;
}

/** Diseños de tarjetas de WHCC para una ocasión (etiqueta), paginados. */
export async function listCardDesigns(opts: {
  productRefs: string[];
  tag: string;
  limit?: number;
  cursor?: string | null;
}): Promise<{ designs: CardDesign[]; nextCursor: string | null; total: number }> {
  const qs = new URLSearchParams({ products: opts.productRefs.join(","), tags: opts.tag, limit: String(opts.limit ?? 24) });
  if (opts.cursor) qs.set("cursor", opts.cursor);
  type Raw = {
    id: string;
    primaryDisplayName?: string;
    secondaryDisplayName?: string;
    productRefs?: string[];
    baseImages?: { front?: { previewUrl?: string; smallUrl?: string } };
    themes?: { smallUrl?: string; previewUrl?: string }[];
  };
  // fetch de Node ya pide gzip (WHCC lo exige en esta ruta).
  const res = await whcc<{ designs: Raw[]; nextCursor?: string; totalCount?: number }>(`/v1/catalog/designs?${qs}`);
  return {
    designs: res.designs.map((d) => ({
      id: d.id,
      name: d.primaryDisplayName ?? "Diseño",
      subtitle: d.secondaryDisplayName ?? "",
      productRefs: d.productRefs ?? [],
      previewUrl: d.baseImages?.front?.smallUrl ?? d.themes?.[0]?.smallUrl ?? d.baseImages?.front?.previewUrl ?? null,
    })),
    nextCursor: res.nextCursor ?? null,
    total: res.totalCount ?? res.designs.length,
  };
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export interface LabLine {
  productRef: string;
  selections: Selections;
  quantity: number;
  /** URL de la imagen original, accesible al menos 7 días. */
  imageUrl: string;
}

/** Arma los productos con las fotos del cliente. Devuelve un id por línea. */
export async function buildOrderItems(lines: LabLine[]): Promise<string[]> {
  if (lines.length === 0 || lines.length > 50) throw new Error("Un pedido admite de 1 a 50 líneas");
  const res = await buildConfigured(
    lines.map((l) => ({ productId: l.productRef, selections: { ...l.selections, quantity: 1 }, images: [{ url: l.imageUrl }] })),
  );
  return res.items.map((i) => i.configuredProductId);
}

// ---------------------------------------------------------------------------
// Productos que se diseñan en el editor de WHCC (photobooks y tarjetas)
// ---------------------------------------------------------------------------

/** Crea un libro o una tarjeta para diseñar. Las fotos quedan en la bandeja del editor. */
export async function createEditorProduct(input: {
  productRef: string;
  selections: Selections;
  designId?: string | null;
  imageUrls: string[];
}): Promise<{ configuredProductId: string; unitPriceCents: number }> {
  const entry: BuildEntry = {
    productId: input.productRef,
    selections: input.selections,
    ...(input.designId ? { designId: input.designId } : {}),
    ...(input.imageUrls.length > 0 ? { images: input.imageUrls.map((url) => ({ url })) } : {}),
  };
  const res = await buildConfigured([entry]);
  const item = res.items[0];
  if (!item?.configuredProductId) throw new Error("WHCC no devolvió el producto creado");
  return { configuredProductId: item.configuredProductId, unitPriceCents: moneyToCents(item.unitPrice) };
}

/**
 * Enlace al editor de WHCC. Es una credencial: no se guarda ni se registra.
 * `completeUrl` debe incluir %EDITOR_ID% y un token propio de un solo uso.
 */
export async function editorLink(configuredProductId: string, completeUrl: string, cancelUrl: string): Promise<string> {
  const res = await whcc<{ actions?: { edit?: { url: string } } }>(
    `/v1/commerce/configured-products/${encodeURIComponent(configuredProductId)}/edit-link`,
    {
      method: "POST",
      body: JSON.stringify({
        redirects: {
          complete: { text: "Listo, volver al carrito", url: completeUrl },
          cancel: { text: "Volver a la galería", url: cancelUrl },
        },
        // Sin opción de subir fotos: el cliente usa solo las de la galería.
        settings: { hidePricing: true, disableUploads: true, addToProject: false, productSwitcher: false },
      }),
    },
  );
  const url = res.actions?.edit?.url;
  if (!url) throw new Error("WHCC no devolvió el enlace del editor");
  return url;
}

export interface CalculatedItem {
  configuredProductId: string;
  quantity: number;
  unitPriceCents: number;
  isValidForOrder: boolean;
  previewUrl: string | null;
  problems: string[];
}

/**
 * Precio y validez de productos ya armados (lo que el cliente diseñó en el
 * editor). Sin dirección da solo el precio de producto; con dirección también
 * el envío.
 */
export async function calculateItems(
  items: { configuredProductId: string; quantity?: number }[],
  address?: ShippingAddress,
): Promise<{ items: CalculatedItem[]; shippingCents: number | null }> {
  type Raw = {
    items: {
      configuredProductId: string;
      quantity: number;
      unitPrice?: Money;
      isValidForOrder?: boolean;
      previewUrl?: string;
      previews?: { scale_512?: string; previewUrl?: string }[];
      validationSummary?: { level: string; message: string }[];
    }[];
    totalPrice?: { subtotals?: { shipping?: Money } };
  };
  const res = await whcc<Raw>("/v1/commerce/submissions/calculate", {
    method: "POST",
    body: JSON.stringify({
      items,
      shipping: {
        type: "dropship",
        priority: "dropship_lowest_cost",
        ...(address ? { address: whccAddress(address) } : {}),
      },
    }),
  });
  return {
    items: res.items.map((i) => ({
      configuredProductId: i.configuredProductId,
      quantity: i.quantity,
      unitPriceCents: moneyToCents(i.unitPrice),
      isValidForOrder: Boolean(i.isValidForOrder),
      previewUrl: i.previews?.[0]?.scale_512 ?? i.previewUrl ?? null,
      problems: (i.validationSummary ?? []).filter((v) => v.level === "error").map((v) => v.message),
    })),
    shippingCents: address ? moneyToCents(res.totalPrice?.subtotals?.shipping) : null,
  };
}

function whccAddress(a: ShippingAddress) {
  const { name, addr1, addr2, city, state, zip, country } = a;
  return { name, addr1, ...(addr2 ? { addr2 } : {}), city, state, zip, country };
}

export type BuildStatus = { ready: boolean; failed: { id: string; message: string }[] };

/** Espera a que WHCC procese las imágenes (descarga y validación). */
export async function waitForItems(ids: string[], timeoutMs = 90_000): Promise<BuildStatus> {
  const started = Date.now();
  let delay = 3000;
  for (;;) {
    const res = await whcc<{ items: BuildItem[] }>(`/v1/commerce/configured-products?ids=${ids.map(encodeURIComponent).join(",")}`);
    const failed = res.items
      .filter((i) => i.status === "failed" || i.status === "not-found")
      .map((i) => ({
        id: i.configuredProductId,
        message: i.validationSummary?.find((v) => v.level === "error")?.message ?? i.status,
      }));
    if (failed.length > 0) return { ready: false, failed };
    if (res.items.every((i) => i.status === "ready")) return { ready: true, failed: [] };
    if (Date.now() - started > timeoutMs) return { ready: false, failed: [] };
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 10_000);
  }
}

export type SubmissionStatus = "staged" | "submitting" | "placed" | "shipped" | "canceled" | "failed" | "partially_failed";

export type Submission = {
  id: string;
  status: SubmissionStatus;
  orders?: { confirmationId: string; status: string; failure?: { code?: string; message?: string } }[];
};

/**
 * Envía el pedido (envío directo al cliente, el más económico). La clave de
 * idempotencia es el id del pedido: reintentar con el mismo cuerpo no duplica.
 */
export async function submitOrder(input: {
  orderId: string;
  reference: string;
  items: { configuredProductId: string; quantity: number }[];
  address: ShippingAddress;
}): Promise<Submission> {
  const { name, addr1, addr2, city, state, zip, country } = input.address;
  return whcc<Submission>("/v1/commerce/submissions", {
    method: "POST",
    idempotencyKey: input.orderId,
    body: JSON.stringify({
      items: input.items,
      shipping: {
        type: "dropship",
        priority: "dropship_lowest_cost",
        address: { name, addr1, ...(addr2 ? { addr2 } : {}), city, state, zip, country },
      },
      reference: input.reference,
      metadata: { orderId: input.orderId },
    }),
  });
}

export function getSubmission(id: string): Promise<Submission> {
  return whcc<Submission>(`/v1/commerce/submissions/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Webhooks (event subscriptions, versión 2)
// ---------------------------------------------------------------------------

/** Verifica el encabezado WHCC-Signature: t=…,v1=HEX[,v1=HEX] sobre "t.cuerpo". */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 600): boolean {
  if (!header) return false;
  let t: string | null = null;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") t = v;
    else if (k === "v1") sigs.push(v.toLowerCase());
  }
  if (!t || sigs.length === 0) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "utf8");
  return sigs.some((s) => {
    const got = Buffer.from(s, "utf8");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export interface WhccEvent {
  eventType: "order.accepted" | "order.rejected" | "order.shipped" | "order.cancelled" | string;
  confirmationId: string;
  sequenceNumber: string;
  reference: string | null;
  orderNumber: number | null;
  errors: string[];
  shipping: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shipDate: string | null }[];
}

export function parseWebhook(body: Record<string, unknown>): WhccEvent {
  const shipping = Array.isArray(body.ShippingInfo) ? (body.ShippingInfo as Record<string, unknown>[]) : [];
  const errors = Array.isArray(body.Errors) ? (body.Errors as Record<string, unknown>[]) : [];
  return {
    eventType: String(body.EventType ?? ""),
    confirmationId: String(body.ConfirmationId ?? ""),
    sequenceNumber: String(body.SequenceNumber ?? ""),
    reference: typeof body.Reference === "string" ? body.Reference : null,
    orderNumber: typeof body.OrderNumber === "number" ? body.OrderNumber : null,
    errors: errors.map((e) => String(e.Error ?? e.ErrorCode ?? "Error")),
    shipping: shipping.map((s) => ({
      carrier: s.Carrier ? String(s.Carrier) : null,
      trackingNumber: s.TrackingNumber ? String(s.TrackingNumber) : null,
      trackingUrl: s.TrackingUrl ? String(s.TrackingUrl) : null,
      shipDate: s.ShipDate ? String(s.ShipDate) : null,
    })),
  };
}
