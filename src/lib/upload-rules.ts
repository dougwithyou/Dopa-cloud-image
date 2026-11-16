// Reglas de subida: tipos MIME permitidos, tamaños máximos y tamaño de parte.
// Se evalúan SIEMPRE en el servidor antes de firmar nada.

import { intEnv } from "@/lib/env";

const MB = 1024 * 1024;

type MediaKind = "photo" | "video";

const ALLOWED: Record<string, { kind: MediaKind; extensions: string[] }> = {
  "image/jpeg": { kind: "photo", extensions: ["jpg", "jpeg"] },
  "image/png": { kind: "photo", extensions: ["png"] },
  "image/webp": { kind: "photo", extensions: ["webp"] },
  "image/heic": { kind: "photo", extensions: ["heic"] },
  "image/heif": { kind: "photo", extensions: ["heif", "heic"] },
  "image/avif": { kind: "photo", extensions: ["avif"] },
  "video/mp4": { kind: "video", extensions: ["mp4", "m4v"] },
  "video/quicktime": { kind: "video", extensions: ["mov", "qt"] },
  "video/webm": { kind: "video", extensions: ["webm"] },
};

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED).join(",");

export function maxBytesFor(kind: MediaKind): number {
  return kind === "photo"
    ? intEnv("MAX_PHOTO_UPLOAD_MB", 50) * MB
    : intEnv("MAX_VIDEO_UPLOAD_MB", 5120) * MB; // 5 GB por defecto
}

export type UploadValidation =
  | { ok: true; kind: MediaKind; mimeType: string }
  | { ok: false; error: string };

export function validateUpload(input: { fileName: string; mimeType: string; size: number }): UploadValidation {
  const mimeType = input.mimeType.toLowerCase().trim();
  const rule = ALLOWED[mimeType];
  if (!rule) return { ok: false, error: `Tipo de archivo no permitido: ${input.mimeType || "desconocido"}` };

  const ext = input.fileName.toLowerCase().split(".").pop() ?? "";
  if (!rule.extensions.includes(ext)) {
    return { ok: false, error: `La extensión .${ext} no coincide con el tipo ${mimeType}` };
  }

  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    return { ok: false, error: "Tamaño de archivo inválido" };
  }
  const max = maxBytesFor(rule.kind);
  if (input.size > max) {
    return { ok: false, error: `El archivo supera el máximo de ${Math.round(max / MB)} MB` };
  }
  return { ok: true, kind: rule.kind, mimeType };
}

/**
 * Tamaño de parte para multipart. R2 exige que todas las partes salvo la última
 * tengan el mismo tamaño (mín. 5 MiB) y admite hasta 10.000 partes.
 */
export function partPlan(size: number): { partSize: number; partCount: number } {
  const minPart = 16 * MB;
  const partSize = Math.max(minPart, Math.ceil(size / 10_000 / MB) * MB);
  return { partSize, partCount: Math.max(1, Math.ceil(size / partSize)) };
}
