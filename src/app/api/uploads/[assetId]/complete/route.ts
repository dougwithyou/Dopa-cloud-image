import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadPendingAsset } from "@/lib/upload-session";
import { completeMultipartUpload, deleteObject, headObject } from "@/lib/r2";
import { partPlan } from "@/lib/upload-rules";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const Body = z.object({
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(10_000), etag: z.string().min(1).max(200) }))
    .min(1)
    .max(10_000),
});

/**
 * Cierra el multipart upload, comprueba en R2 el tamaño real del objeto y
 * marca el asset como upload_status = 'complete'.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });

  const loaded = await loadPendingAsset(assetId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { asset } = loaded;

  const { partCount } = partPlan(asset.size_bytes);
  const numbers = new Set(parsed.data.parts.map((p) => p.partNumber));
  if (numbers.size !== partCount || [...numbers].some((n) => n > partCount)) {
    return NextResponse.json({ error: "Faltan partes o hay partes de más" }, { status: 400 });
  }

  try {
    await completeMultipartUpload(asset.r2_key, asset.r2_upload_id, parsed.data.parts);
  } catch (err) {
    console.error("[uploads] completeMultipartUpload", err);
    return NextResponse.json({ error: "No se pudo completar la subida" }, { status: 502 });
  }

  const admin = createAdminClient();
  const head = await headObject(asset.r2_key);

  // El tamaño real no puede superar el reservado (las URLs prefirmadas no
  // limitan el tamaño de cada parte, así que se verifica aquí).
  if (!head || head.size > asset.size_bytes || head.size === 0) {
    await deleteObject(asset.r2_key).catch(() => undefined);
    await admin.from("assets").delete().eq("id", asset.id);
    return NextResponse.json({ error: "El archivo subido no coincide con el declarado" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("assets")
    .update({
      upload_status: "complete",
      size_bytes: head.size,
      r2_upload_id: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", asset.id)
    .eq("upload_status", "pending")
    .select("id, kind, file_name, size_bytes, upload_status")
    .single();
  if (error) {
    console.error("[uploads] marcar complete", error);
    return NextResponse.json({ error: "No se pudo registrar el archivo" }, { status: 500 });
  }

  return NextResponse.json({ asset: data });
}
