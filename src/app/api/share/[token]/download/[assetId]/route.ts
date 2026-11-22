import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findSharedGallery, hasVisitorAccess } from "@/lib/share";
import { signDownloadUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

/** Descarga para visitantes de una galería compartida por enlace (ya registrados). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  const gallery = await findSharedGallery(token);
  if (!gallery || !(await hasVisitorAccess(gallery.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: asset } = await createAdminClient()
    .from("assets")
    .select("r2_key, file_name")
    .eq("id", assetId)
    .eq("project_id", gallery.id)
    .eq("upload_status", "complete")
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });

  const url = await signDownloadUrl(asset.r2_key, { fileName: asset.file_name, disposition: "attachment", expiresIn: 300 });
  return NextResponse.redirect(url, 302);
}
