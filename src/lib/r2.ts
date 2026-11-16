import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "@/lib/env";

// Las credenciales de R2 solo existen en el servidor (sin prefijo NEXT_PUBLIC_).
let client: S3Client | null = null;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
      // Los checksums CRC32 por defecto del SDK v3 rompen las URLs prefirmadas de R2.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

function bucket(): string {
  return requireEnv("R2_BUCKET");
}

/** Expiración de URLs de subida de partes (segundos). */
const UPLOAD_URL_TTL = 60 * 60;
/** Expiración de URLs de descarga / visualización (segundos). */
const DOWNLOAD_URL_TTL = 60 * 60;

// ---------------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------------

/** Nombre de archivo seguro para usar dentro de una clave de objeto. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return (cleaned || "archivo").slice(-120);
}

export function projectPrefix(p: { creatorId: string; clientId: string; projectId: string }): string {
  return `creators/${p.creatorId}/clients/${p.clientId}/projects/${p.projectId}/`;
}

export function clientPrefix(p: { creatorId: string; clientId: string }): string {
  return `creators/${p.creatorId}/clients/${p.clientId}/`;
}

/**
 * creators/{creator_id}/clients/{client_id}/projects/{project_id}/{photos|videos}/{asset_id}-{file_name}
 * El id del asset delante del nombre evita que dos archivos con el mismo
 * nombre se sobrescriban.
 */
export function buildAssetKey(p: {
  creatorId: string;
  clientId: string;
  projectId: string;
  assetId: string;
  kind: "photo" | "video";
  fileName: string;
}): string {
  const folder = p.kind === "photo" ? "photos" : "videos";
  return `${projectPrefix(p)}${folder}/${p.assetId}-${sanitizeFileName(p.fileName)}`;
}

// ---------------------------------------------------------------------------
// Multipart upload
// ---------------------------------------------------------------------------

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await r2().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
  );
  if (!res.UploadId) throw new Error("R2 no devolvió UploadId");
  return res.UploadId;
}

/** URLs prefirmadas (PUT) para subir partes directamente desde el navegador. */
export async function signUploadParts(
  key: string,
  uploadId: string,
  partNumbers: number[],
): Promise<{ partNumber: number; url: string }[]> {
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        r2(),
        new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }),
        { expiresIn: UPLOAD_URL_TTL },
      ),
    })),
  );
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  await r2().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: sorted.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  try {
    await r2().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
  } catch (err) {
    // NoSuchUpload: ya estaba completado o abortado.
    if ((err as { name?: string }).name !== "NoSuchUpload") throw err;
  }
}

// ---------------------------------------------------------------------------
// Objetos
// ---------------------------------------------------------------------------

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Borra todos los objetos bajo un prefijo (p. ej. al eliminar un proyecto). */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!prefix.startsWith("creators/") || !prefix.endsWith("/")) {
    throw new Error(`Prefijo no permitido: ${prefix}`);
  }
  let deleted = 0;
  let token: string | undefined;
  do {
    const list = await r2().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (list.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length > 0) {
      await r2().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys, Quiet: true } }));
      deleted += keys.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

/**
 * URL prefirmada de lectura.
 *  - disposition "attachment": fuerza la descarga con el nombre original.
 *  - disposition "inline": para <img>/<video> en el feed.
 */
export async function signDownloadUrl(
  key: string,
  opts: { fileName?: string | null; disposition?: "attachment" | "inline"; expiresIn?: number } = {},
): Promise<string> {
  const disposition = opts.disposition ?? "inline";
  let contentDisposition: string | undefined;
  if (disposition === "attachment") {
    const name = opts.fileName || key.split("/").pop() || "archivo";
    const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    contentDisposition = `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: contentDisposition }),
    { expiresIn: opts.expiresIn ?? DOWNLOAD_URL_TTL },
  );
}
