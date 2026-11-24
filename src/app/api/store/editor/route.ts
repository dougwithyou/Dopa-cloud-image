import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { createEditorProduct, editorLink } from "@/lib/labs/whcc";
import { signDownloadUrl } from "@/lib/r2";
import { getStoreAccess, loadStoreProducts } from "@/lib/store";
import { isPrintable } from "@/lib/store-types";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fotos de la galería que se cargan en la bandeja del editor. */
const MAX_EDITOR_PHOTOS = 100;
const LAB_IMAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

const Body = z.union([
  z.object({ projectId: z.uuid(), productId: z.uuid(), designId: z.string().max(64).optional() }),
  z.object({ projectId: z.uuid(), editorItemId: z.uuid() }),
]);

/**
 * Abre el editor de WHCC para diseñar un photobook o tarjetas con las fotos de
 * la galería. Con `editorItemId`, vuelve a abrir un diseño que ya existe.
 * Devuelve la URL del editor (es una credencial: no se guarda).
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const body = parsed.data;

  const access = await getStoreAccess(body.projectId);
  if (!access) return NextResponse.json({ error: "La tienda de esta galería no está disponible." }, { status: 403 });
  const admin = createAdminClient();
  const token = randomBytes(18).toString("base64url");

  let editorItemId: string;
  let configuredProductId: string;

  if ("editorItemId" in body) {
    const { data: item } = await admin
      .from("print_editor_items")
      .select("id, configured_product_id")
      .eq("id", body.editorItemId)
      .eq("project_id", body.projectId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "Diseño no encontrado." }, { status: 404 });
    await admin.from("print_editor_items").update({ return_token: token, finished: false }).eq("id", item.id);
    editorItemId = item.id;
    configuredProductId = item.configured_product_id;
  } else {
    const product = (await loadStoreProducts(admin, access.creator)).find(
      (p) => p.id === body.productId && p.completion === "editor",
    );
    if (!product) return NextResponse.json({ error: "Producto no disponible." }, { status: 404 });
    if (product.kind === "card" && !body.designId) return NextResponse.json({ error: "Elige un diseño." }, { status: 400 });

    const { data: assets } = await admin
      .from("assets")
      .select("kind, file_name, size_bytes, r2_key")
      .eq("project_id", body.projectId)
      .eq("kind", "photo")
      .eq("upload_status", "complete")
      .order("created_at")
      .limit(400);
    const photos = (assets ?? []).filter((a) => isPrintable({ ...a, size_bytes: Number(a.size_bytes) })).slice(0, MAX_EDITOR_PHOTOS);
    const imageUrls = await Promise.all(photos.map((a) => signDownloadUrl(a.r2_key, { expiresIn: LAB_IMAGE_TTL_SECONDS })));

    const selections: Record<string, string | number> =
      product.kind === "card" ? { quantity: product.minQuantity } : stringSelections(product.selections);
    try {
      const created = await createEditorProduct({
        productRef: product.productRef,
        selections,
        designId: product.kind === "card" ? body.designId : null,
        imageUrls,
      });
      configuredProductId = created.configuredProductId;
    } catch (err) {
      console.error("[store] No se pudo crear el diseño", err);
      return NextResponse.json({ error: "No se pudo abrir el editor. Inténtalo de nuevo." }, { status: 502 });
    }
    const { data: item, error } = await admin
      .from("print_editor_items")
      .insert({
        creator_id: access.creator.id,
        project_id: body.projectId,
        product_id: product.id,
        configured_product_id: configuredProductId,
        design_id: product.kind === "card" ? (body.designId ?? null) : null,
        return_token: token,
      })
      .select("id")
      .single();
    if (error) throw error;
    editorItemId = item.id;
  }

  // WHCC reemplaza %EDITOR_ID% por el producto; el token se acepta una sola vez.
  const complete = appUrl(`/tienda/${body.projectId}/editor-listo?item=%EDITOR_ID%&t=${token}`);
  const cancel = appUrl(access.galleryHref);
  try {
    const url = await editorLink(configuredProductId, complete, cancel);
    return NextResponse.json({ url, editorItemId });
  } catch (err) {
    console.error("[store] Enlace del editor", err);
    return NextResponse.json({ error: "No se pudo abrir el editor. Inténtalo de nuevo." }, { status: 502 });
  }
}

function stringSelections(sel: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(sel)) if (typeof v === "string" || typeof v === "number") out[k] = v;
  return out;
}
