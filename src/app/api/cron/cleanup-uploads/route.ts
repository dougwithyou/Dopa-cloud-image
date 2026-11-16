import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { abortMultipartUpload } from "@/lib/r2";

export const dynamic = "force-dynamic";

const STALE_HOURS = 24;

/**
 * Cron diario (vercel.json): aborta subidas 'pending' abandonadas para liberar
 * el espacio reservado y las partes huérfanas en R2.
 * Vercel envía Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();
  const { data: stale, error } = await admin
    .from("assets")
    .select("id, r2_key, r2_upload_id")
    .eq("upload_status", "pending")
    .lt("created_at", cutoff)
    .limit(500);
  if (error) throw error;

  let cleaned = 0;
  for (const asset of stale ?? []) {
    try {
      if (asset.r2_key && asset.r2_upload_id) await abortMultipartUpload(asset.r2_key, asset.r2_upload_id);
      await admin.from("assets").delete().eq("id", asset.id).eq("upload_status", "pending");
      cleaned++;
    } catch (err) {
      console.error("[cron] No se pudo limpiar", asset.id, err);
    }
  }
  return NextResponse.json({ cleaned });
}
