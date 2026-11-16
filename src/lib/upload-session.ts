import "server-only";
import { getCreatorContext } from "@/lib/auth";
import type { AssetRow } from "@/types/database";

/**
 * Carga un asset 'pending' del creador autenticado. La consulta usa el cliente
 * con sesión, así que RLS garantiza que el asset es suyo.
 */
export async function loadPendingAsset(assetId: string): Promise<
  | { ok: true; asset: AssetRow & { r2_key: string; r2_upload_id: string } }
  | { ok: false; status: number; error: string }
> {
  const ctx = await getCreatorContext();
  if (!ctx) return { ok: false, status: 401, error: "No autenticado" };

  const { data: asset } = await ctx.supabase
    .from("assets")
    .select("*")
    .eq("id", assetId)
    .eq("creator_id", ctx.creator.id)
    .maybeSingle();

  if (!asset) return { ok: false, status: 404, error: "Archivo no encontrado" };
  if (asset.upload_status !== "pending" || !asset.r2_key || !asset.r2_upload_id) {
    return { ok: false, status: 409, error: "La subida ya no está en curso" };
  }
  return { ok: true, asset: asset as AssetRow & { r2_key: string; r2_upload_id: string } };
}
