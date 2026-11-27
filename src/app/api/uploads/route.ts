import { randomUUID } from "node:crypto";
import { getI18n } from "@/i18n/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCreatorContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAssetKey, createMultipartUpload } from "@/lib/r2";
import { partPlan, validateUpload, type UploadValidation } from "@/lib/upload-rules";
import type { Messages } from "@/i18n/messages";

/** Motivo del rechazo de un archivo, en el idioma de quien sube. */
function uploadError(a: Messages["api"], v: Extract<UploadValidation, { ok: false }>, mimeType = ""): string {
  if (v.code === "type") return a.fileType(mimeType);
  if (v.code === "ext") return a.fileExt(v.ext ?? "", mimeType);
  if (v.code === "too_big") return a.fileTooBig(v.maxMb ?? 0);
  return a.fileSize;
}
import { checkUploadLimits, limitErrorFromDb } from "@/lib/limits";

export const dynamic = "force-dynamic";

const Body = z.object({
  projectId: z.uuid(),
  /** Opcional: si se indica, el archivo entra directo en esa publicación. */
  postId: z.uuid().optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

/**
 * Inicia una subida multipart:
 *  1. valida MIME, extensión y tamaño máximo,
 *  2. verifica suscripción, almacenamiento y número de clientes,
 *  3. reserva el espacio y crea el archivo 'pending' en la biblioteca del
 *     proyecto (atómico en Postgres),
 *  4. crea el multipart upload en R2.
 * El navegador recibe solo el id del asset y el plan de partes.
 */
export async function POST(req: NextRequest) {
  const a = (await getI18n()).t.api;
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.json({ error: a.notAuthenticated }, { status: 401 });
  const { supabase, creator } = ctx;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: a.invalidRequest }, { status: 400 });
  const { projectId, postId, fileName, mimeType, size } = parsed.data;

  const validation = validateUpload({ fileName, mimeType, size });
  if (!validation.ok) return NextResponse.json({ error: uploadError(a, validation, mimeType) }, { status: 415 });

  const limits = await checkUploadLimits(creator, size);
  if (!limits.ok) return NextResponse.json({ error: limits.message, code: limits.code }, { status: 403 });

  // RLS: solo devuelve el proyecto si pertenece al creador autenticado.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("creator_id", creator.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: a.projectNotFound }, { status: 404 });

  const assetId = randomUUID();
  const key = buildAssetKey({
    creatorId: creator.id,
    projectId: project.id,
    assetId,
    kind: validation.kind,
    fileName,
  });

  const admin = createAdminClient();
  const { error: reserveError } = await admin.rpc("reserve_asset_upload", {
    p_asset_id: assetId,
    p_creator_id: creator.id,
    p_project_id: project.id,
    p_post_id: postId ?? null,
    p_kind: validation.kind,
    p_r2_key: key,
    p_file_name: fileName,
    p_mime_type: validation.mimeType,
    p_size_bytes: size,
  });
  if (reserveError) {
    const mapped = await limitErrorFromDb(reserveError.message);
    if (mapped) return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: 403 });
    console.error("[uploads] reserve_asset_upload", reserveError);
    return NextResponse.json({ error: a.uploadStartFailed }, { status: 500 });
  }

  try {
    const uploadId = await createMultipartUpload(key, validation.mimeType);
    const { error } = await admin.from("assets").update({ r2_upload_id: uploadId }).eq("id", assetId);
    if (error) throw error;
  } catch (err) {
    console.error("[uploads] createMultipartUpload", err);
    await admin.from("assets").delete().eq("id", assetId);
    return NextResponse.json({ error: a.storageStartFailed }, { status: 502 });
  }

  const plan = partPlan(size);
  return NextResponse.json({ assetId, kind: validation.kind, ...plan });
}
