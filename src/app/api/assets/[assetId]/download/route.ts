import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { signDownloadUrl } from "@/lib/r2";

export const dynamic = "force-dynamic";

/**
 * Descarga de un archivo. Sirve para creador y cliente: la consulta se hace
 * con la sesión del usuario, así que RLS decide si puede verlo (para clientes
 * incluye: proyecto publicado + portal abierto / periodo de gracia).
 * Responde con un redirect a una URL prefirmada de R2 de corta duración.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const { supabase, user } = await getSession();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: asset } = await supabase
    .from("assets")
    .select("id, kind, r2_key, file_name, upload_status")
    .eq("id", assetId)
    .maybeSingle();

  if (!asset || asset.kind === "copy" || !asset.r2_key || asset.upload_status !== "complete") {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const url = await signDownloadUrl(asset.r2_key, {
    fileName: asset.file_name,
    disposition: inline ? "inline" : "attachment",
    expiresIn: 300,
  });
  return NextResponse.redirect(url, 302);
}
