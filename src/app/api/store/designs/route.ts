import { getI18n } from "@/i18n/server";
import { NextResponse, type NextRequest } from "next/server";
import { listCardDesigns } from "@/lib/labs/whcc";
import { CARD_OCCASIONS } from "@/lib/print-offerings";
import { getStoreAccess, loadStoreProducts } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Diseños de tarjetas de WHCC para la tienda de una galería (con acceso a ella). */
export async function GET(req: NextRequest) {
  const a = (await getI18n()).t.api;
  const sp = req.nextUrl.searchParams;
  const projectId = sp.get("projectId") ?? "";
  const productId = sp.get("productId") ?? "";
  const tag = sp.get("tag") ?? CARD_OCCASIONS[0].tag;
  if (!CARD_OCCASIONS.some((o) => o.tag === tag)) return NextResponse.json({ error: a.invalidOccasion }, { status: 400 });

  const access = await getStoreAccess(projectId);
  if (!access) return NextResponse.json({ error: a.storeUnavailable }, { status: 403 });
  const product = (await loadStoreProducts(createAdminClient(), access.creator)).find((p) => p.id === productId && p.kind === "card");
  if (!product) return NextResponse.json({ error: a.productUnavailable }, { status: 404 });

  try {
    const page = await listCardDesigns({ productRefs: [product.productRef], tag, limit: 24, cursor: sp.get("cursor") });
    return NextResponse.json(page, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    console.error("[store] diseños de tarjetas", err);
    return NextResponse.json({ error: a.designsFailed }, { status: 502 });
  }
}
