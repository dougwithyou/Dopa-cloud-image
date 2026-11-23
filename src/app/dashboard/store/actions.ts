"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCreatorContext } from "@/lib/auth";
import { MAX_MARKUP_PERCENT, MIN_MARKUP_PERCENT } from "@/lib/print-pricing";

async function ctxOrThrow() {
  const ctx = await getCreatorContext();
  if (!ctx) redirect("/login");
  return ctx;
}

const Markup = z.coerce.number().int().min(MIN_MARKUP_PERCENT).max(MAX_MARKUP_PERCENT);

/** Margen por defecto sobre el costo del laboratorio. */
export async function updateStoreMarkup(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const markup = Markup.safeParse(formData.get("markup"));
  if (!markup.success) return;
  await supabase.from("creators").update({ store_markup_percent: markup.data }).eq("id", creator.id);
  revalidatePath("/dashboard/store");
}

/**
 * Margen y disponibilidad de un producto (todos sus tamaños a la vez).
 * Margen vacío = usar el margen por defecto.
 */
export async function saveProductSettings(formData: FormData): Promise<void> {
  const { supabase, creator } = await ctxOrThrow();
  const ref = z.string().min(1).max(120).safeParse(formData.get("productRef"));
  if (!ref.success) return;
  const rawMarkup = String(formData.get("markup") ?? "").trim();
  const markup = rawMarkup === "" ? null : Markup.safeParse(rawMarkup);
  if (markup && !markup.success) return;
  const enabled = formData.get("enabled") === "on";

  const { data: variants } = await supabase.from("print_products").select("id").eq("product_ref", ref.data);
  if (!variants || variants.length === 0) return;
  await supabase.from("creator_product_prices").upsert(
    variants.map((v) => ({
      creator_id: creator.id,
      product_id: v.id,
      markup_percent: markup ? markup.data : null,
      enabled,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "creator_id,product_id" },
  );
  revalidatePath("/dashboard/store");
}

/** Activa o apaga la tienda de una galería. */
export async function setProjectStore(formData: FormData): Promise<void> {
  const { supabase } = await ctxOrThrow();
  const id = z.uuid().safeParse(formData.get("projectId"));
  if (!id.success) return;
  const enabled = formData.get("enabled") === "true";
  await supabase.from("projects").update({ store_enabled: enabled }).eq("id", id.data).eq("type", "photo_session");
  revalidatePath(`/dashboard/projects/${id.data}`);
}
