import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";
import { resolveSelections, sizeOptions, type Selections, type WhccField } from "@/lib/labs/whcc-selections";
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
// Catálogo
// ---------------------------------------------------------------------------

type CatalogListItem = {
  ref: string;
  name: string;
  completion: "api" | "editor";
  description?: string;
  category: { ref: string; name: string };
  kind?: string;
  resolution?: number;
  sizedBy?: string[];
};

type CatalogDetail = CatalogListItem & { configuration?: { fields: WhccField[] } };

async function listApiProducts(): Promise<CatalogListItem[]> {
  const out: CatalogListItem[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const page = await whcc<{ products: CatalogListItem[]; nextCursor?: string }>(`/v1/catalog/products?${qs}`);
    out.push(...page.products.filter((p) => p.completion === "api"));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

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
}

type BuildItem = {
  configuredProductId: string;
  status: "processing" | "ready" | "failed" | "not-found";
  unitPrice?: Money;
  validationSummary?: { id: number; level: string; message: string }[];
};

type BuildEntry = { productId: string; selections: Selections; images: { url: string }[] };

async function buildConfigured(entries: BuildEntry[]) {
  return whcc<{ items: BuildItem[]; actions?: { poll?: { url: string } } }>("/v1/commerce/configured-products", {
    method: "POST",
    body: JSON.stringify({ configuredProducts: entries }),
  });
}

/**
 * Lee el catálogo de productos que se piden por API (impresiones y cuadros) y
 * su costo mayorista por tamaño. WHCC solo da el precio al "armar" un producto
 * con una imagen, así que se arma cada producto/tamaño con una imagen de
 * prueba (en lotes de 50) y se guarda su precio unitario.
 */
export async function fetchCatalog(): Promise<CatalogVariant[]> {
  const sample = process.env.WHCC_SAMPLE_IMAGE_URL || DEFAULT_SAMPLE_IMAGE;
  const allow = (process.env.WHCC_CATEGORY_REFS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const products = (await listApiProducts()).filter((p) => allow.length === 0 || allow.includes(p.category.ref));

  const pending: { variant: Omit<CatalogVariant, "cost_cents">; entry: BuildEntry }[] = [];
  let sort = 0;
  for (const p of products) {
    const detail = await whcc<CatalogDetail>(`/v1/catalog/products/${encodeURIComponent(p.ref)}`);
    const fields = detail.configuration?.fields ?? [];
    const sizes = sizeOptions(fields, detail.sizedBy);
    if (!sizes) continue;
    for (const size of sizes.values) {
      const selections = resolveSelections(fields, { [sizes.field]: size.id });
      if (!selections) continue;
      pending.push({
        variant: {
          product_ref: detail.ref,
          product_name: detail.name,
          category_ref: detail.category.ref,
          category_name: detail.category.name,
          size_id: size.id,
          size_label: size.name ?? size.id,
          width_in: size.width ?? null,
          height_in: size.height ?? null,
          selections,
          resolution: detail.resolution ?? null,
          description: detail.description ?? null,
          sort: sort++,
        },
        entry: { productId: detail.ref, selections, images: [{ url: sample }] },
      });
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
  for (let i = 0; i < pending.length; i += 50) {
    const batch = pending.slice(i, i + 50);
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
  return priced;
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
