import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/auth";
import { appUrl, requireEnv } from "@/lib/env";
import { whccConfigured, LAB_ID } from "@/lib/labs/whcc";
import { retailPriceCents, shippingCentsFor } from "@/lib/print-pricing";
import { hasVisitorAccess } from "@/lib/share";
import { canUpload } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreConfig, StoreProduct } from "@/lib/store-types";
import type { CreatorRow } from "@/types/database";

type Admin = ReturnType<typeof createAdminClient>;

/** ¿Puede vender este creador? (laboratorio configurado, cobros conectados y suscripción al día) */
export function creatorCanSell(creator: Pick<CreatorRow, "connect_payouts_enabled" | "subscription_status">): boolean {
  return whccConfigured() && creator.connect_payouts_enabled && canUpload(creator);
}

/** Productos a la venta para un creador, con su precio final (sin costos). */
export async function loadStoreProducts(admin: Admin, creator: Pick<CreatorRow, "id" | "store_markup_percent">) {
  const [{ data: products }, { data: overrides }] = await Promise.all([
    admin.from("print_products").select("*").eq("lab", LAB_ID).eq("active", true).order("sort"),
    admin.from("creator_product_prices").select("product_id, markup_percent, enabled").eq("creator_id", creator.id),
  ]);
  const byProduct = new Map((overrides ?? []).map((o) => [o.product_id, o]));
  const list: (StoreProduct & { costCents: number; selections: Record<string, unknown>; markupPercent: number })[] = [];
  for (const p of products ?? []) {
    const o = byProduct.get(p.id);
    if (o && !o.enabled) continue;
    const markupPercent = o?.markup_percent ?? creator.store_markup_percent;
    list.push({
      id: p.id,
      productRef: p.product_ref,
      productName: p.product_name,
      categoryRef: p.category_ref,
      categoryName: p.category_name,
      sizeLabel: p.size_label,
      widthIn: p.width_in === null ? null : Number(p.width_in),
      heightIn: p.height_in === null ? null : Number(p.height_in),
      priceCents: retailPriceCents(p.cost_cents, markupPercent),
      resolution: p.resolution,
      description: p.description,
      kind: p.kind,
      completion: p.completion,
      minQuantity: p.min_quantity,
      quantityStep: p.quantity_step,
      costCents: p.cost_cents,
      selections: p.selections,
      markupPercent,
    });
  }
  return list;
}

/** Quita lo que no debe llegar al navegador. */
export function publicProducts(list: Awaited<ReturnType<typeof loadStoreProducts>>): StoreProduct[] {
  return list.map(({ costCents: _c, selections: _s, markupPercent: _m, ...rest }) => rest);
}

export type StoreRole = "creator" | "client" | "visitor";

export interface StoreAccess {
  role: StoreRole;
  project: { id: string; title: string; creator_id: string; share_token: string | null };
  creator: CreatorRow;
  /** Para precargar el formulario de compra. */
  buyer: { email: string; name: string; userId: string | null } | null;
  /** Vuelta a la galería desde el carrito. */
  galleryHref: string;
}

/**
 * Quién mira la galería y si puede comprar en ella: el creador (vista previa),
 * su cliente con sesión (proyecto publicado) o un visitante registrado del
 * enlace público. La tienda debe estar activada en la galería.
 */
export async function getStoreAccess(projectId: string): Promise<StoreAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, type, status, creator_id, store_enabled, share_enabled, share_token, clients(user_id, email, name)")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.type !== "photo_session" || !project.store_enabled) return null;
  const { data: creator } = await admin.from("creators").select("*").eq("id", project.creator_id).single();
  if (!creator || !creatorCanSell(creator)) return null;

  const base = { id: project.id, title: project.title, creator_id: project.creator_id, share_token: project.share_token };
  const { user } = await getSession();
  if (user) {
    if (creator.user_id === user.id) {
      return { role: "creator", project: base, creator, buyer: null, galleryHref: `/preview/${project.id}` };
    }
    const client = project.clients;
    if (project.status === "published" && client?.user_id === user.id) {
      return {
        role: "client",
        project: base,
        creator,
        buyer: { email: client.email, name: client.name, userId: user.id },
        galleryHref: `/portal/${project.id}`,
      };
    }
  }
  if (project.share_enabled && project.share_token && (await hasVisitorAccess(project.id))) {
    return { role: "visitor", project: base, creator, buyer: null, galleryHref: `/g/${project.share_token}` };
  }
  return null;
}

/** Configuración de la tienda que recibe la plantilla de la galería (o null si no vende). */
export async function loadStoreConfig(projectId: string): Promise<StoreConfig | null> {
  const access = await getStoreAccess(projectId);
  if (!access) return null;
  const products = publicProducts(await loadStoreProducts(createAdminClient(), access.creator));
  if (products.length === 0) return null;
  return {
    projectId,
    products,
    shippingPerGroupCents: shippingCentsFor(1),
    cartHref: `/tienda/${projectId}`,
  };
}

// ---------------------------------------------------------------------------
// Enlace privado del pedido (para el comprador, sin cuenta)
// ---------------------------------------------------------------------------

function orderSignature(orderId: string): string {
  return createHmac("sha256", requireEnv("SHARE_SECRET")).update(`order.${orderId}`).digest("base64url");
}

export function orderUrl(orderId: string): string {
  return appUrl(`/pedido/${orderId}?t=${orderSignature(orderId)}`);
}

export function verifyOrderToken(orderId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(orderSignature(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Referencia corta para la etiqueta del laboratorio y los correos. */
export function newOrderReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `HDC-${out}`;
}
