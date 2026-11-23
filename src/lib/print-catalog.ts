import "server-only";
import { fetchCatalog, LAB_ID } from "@/lib/labs/whcc";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sincroniza el catálogo y los costos de WHCC. Si un costo sube, los precios
 * suben solos (se calculan con el margen de cada fotógrafo). Lo que WHCC ya no
 * ofrece queda inactivo; no se borra porque hay pedidos que lo usan.
 */
export async function syncPrintCatalog(): Promise<number> {
  const admin = createAdminClient();
  const startedAt = new Date().toISOString();
  const variants = await fetchCatalog();
  if (variants.length === 0) return 0;
  for (let i = 0; i < variants.length; i += 100) {
    const { error } = await admin.from("print_products").upsert(
      variants.slice(i, i + 100).map((v) => ({ ...v, lab: LAB_ID, active: true, synced_at: startedAt })),
      { onConflict: "lab,product_ref,size_id" },
    );
    if (error) throw error;
  }
  await admin.from("print_products").update({ active: false }).eq("lab", LAB_ID).lt("synced_at", startedAt);
  return variants.length;
}
