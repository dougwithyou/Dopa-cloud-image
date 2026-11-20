import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCreatorContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAssetKey, createMultipartUpload } from "@/lib/r2";
import { partPlan, validateUpload } from "@/lib/upload-rules";
import { checkUploadLimits, limitErrorFromDb } from "@/lib/limits";

export const dynamic = "force-dynamic";

const Body = z.object({
  postId: z.uuid(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

/**
 * Inicia una subida multipart:
 *  1. valida MIME, extensión y tamaño máximo,
 *  2. verifica suscripción, almacenamiento y número de clientes,
 *  3. reserva el espacio y crea el archivo 'pending' dentro de la publicación
 *     (atómico en Postgres; máx. 20 por carrusel),
 *  4. crea el multipart upload en R2.
 * El navegador recibe solo el id del asset y el plan de partes.
 */
export async function POST(req: NextRequest) {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { supabase, creator } = ctx;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const { postId, fileName, mimeType, size } = parsed.data;

  const validation = validateUpload({ fileName, mimeType, size });
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 415 });

  const limits = await checkUploadLimits(creator, size);
  if (!limits.ok) return NextResponse.json({ error: limits.message, code: limits.code }, { status: 403 });

  // RLS: solo devuelve la publicación si pertenece al creador autenticado.
  const { data: post } = await supabase
    .from("posts")
    .select("id, project_id")
    .eq("id", postId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: "Publicación no encontrada" }, { status: 404 });

  const assetId = randomUUID();
  const key = buildAssetKey({
    creatorId: creator.id,
    projectId: post.project_id,
    assetId,
    kind: validation.kind,
    fileName,
  });

  const admin = createAdminClient();
  const { error: reserveError } = await admin.rpc("reserve_asset_upload", {
    p_asset_id: assetId,
    p_creator_id: creator.id,
    p_post_id: post.id,
    p_kind: validation.kind,
    p_r2_key: key,
    p_file_name: fileName,
    p_mime_type: validation.mimeType,
    p_size_bytes: size,
  });
  if (reserveError) {
    const mapped = limitErrorFromDb(reserveError.message);
    if (mapped) return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: 403 });
    console.error("[uploads] reserve_asset_upload", reserveError);
    return NextResponse.json({ error: "No se pudo iniciar la subida" }, { status: 500 });
  }

  try {
    const uploadId = await createMultipartUpload(key, validation.mimeType);
    const { error } = await admin.from("assets").update({ r2_upload_id: uploadId }).eq("id", assetId);
    if (error) throw error;
  } catch (err) {
    console.error("[uploads] createMultipartUpload", err);
    await admin.from("assets").delete().eq("id", assetId);
    return NextResponse.json({ error: "No se pudo iniciar la subida en el almacenamiento" }, { status: 502 });
  }

  const plan = partPlan(size);
  return NextResponse.json({ assetId, kind: validation.kind, ...plan });
}
