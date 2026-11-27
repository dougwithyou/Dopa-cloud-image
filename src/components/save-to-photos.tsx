"use client";

import { useI18n } from "@/i18n/client";

import { useEffect, useState } from "react";

/**
 * "Guardar en Fotos": en iPhone/iPad y Android, una descarga normal va a la
 * app Archivos. Para que llegue a Fotos/Galería hay que abrir el menú de
 * compartir del sistema con el archivo (Web Share API), que ofrece
 * "Guardar imagen" / "Guardar video" (o "Guardar N imágenes").
 *
 * Safari exige que navigator.share() ocurra justo tras el toque: si preparar
 * el archivo tarda demasiado, el botón queda en "Listo · toca para guardar" y
 * un segundo toque abre el menú.
 */

export interface ShareableMedia {
  url: string;
  file_name: string;
  kind: "photo" | "video";
  size_bytes?: number;
}

/** Más de esto no se carga en memoria del teléfono: se usa la descarga normal. */
const MAX_SHARE_BYTES = 500 * 1024 * 1024;

type Platform = "ios" | "android" | null;

function detectPlatform(): Platform {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return null;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (!ios && !android) return null;
  try {
    const probe = new File([new Blob(["x"], { type: "image/jpeg" })], "probe.jpg", { type: "image/jpeg" });
    if (!navigator.canShare({ files: [probe] })) return null;
  } catch {
    return null;
  }
  return ios ? "ios" : "android";
}

/** Plataforma con "Guardar en Fotos" disponible (null en computadora o si no hay soporte). */
export function useSaveToPhotosPlatform(): Platform {
  const [platform, setPlatform] = useState<Platform>(null);
  useEffect(() => setPlatform(detectPlatform()), []);
  return platform;
}

function mimeFor(m: ShareableMedia, blobType: string): string {
  if (blobType && blobType !== "application/octet-stream") return blobType;
  const ext = m.file_name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return map[ext] ?? (m.kind === "video" ? "video/mp4" : "image/jpeg");
}

type Status = "idle" | "loading" | "ready" | "done" | "error";

export function SaveToPhotosButton({
  media,
  label,
  className = "btn-primary",
}: {
  media: ShareableMedia[];
  /** Texto del botón; por defecto "Guardar en Fotos" (iOS) o "Guardar en la galería" (Android). */
  label?: string;
  className?: string;
}) {
  const platform = useSaveToPhotosPlatform();
  const [status, setStatus] = useState<Status>("idle");
  const [files, setFiles] = useState<File[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const g = useI18n().t.gallery;

  // Si cambia el contenido (otra foto del carrusel), se reinicia.
  const key = media.map((m) => m.url).join("|");
  useEffect(() => {
    setStatus("idle");
    setFiles(null);
    setError(null);
  }, [key]);

  const totalBytes = media.reduce((n, m) => n + (m.size_bytes ?? 0), 0);
  if (!platform || media.length === 0 || totalBytes > MAX_SHARE_BYTES) return null;

  const defaultLabel = platform === "ios" ? g.saveToPhotos : g.saveToGallery;

  async function share(list: File[]) {
    try {
      await navigator.share({ files: list });
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (err) {
      const name = (err as Error).name;
      if (name === "AbortError") {
        setStatus("ready"); // el usuario cerró el menú; puede volver a intentarlo
      } else if (name === "NotAllowedError") {
        setStatus("ready"); // se perdió el gesto del toque: un toque más
      } else {
        setError(g.shareMenuFailed);
        setStatus("error");
      }
    }
  }

  async function onClick() {
    setError(null);
    if (files) {
      await share(files);
      return;
    }
    setStatus("loading");
    try {
      const list = await Promise.all(
        media.map(async (m) => {
          const res = await fetch(m.url);
          if (!res.ok) throw new Error("download");
          const blob = await res.blob();
          return new File([blob], m.file_name, { type: mimeFor(m, blob.type) });
        }),
      );
      setFiles(list);
      if (!navigator.canShare({ files: list })) {
        setError(g.cannotSave);
        setStatus("error");
        return;
      }
      await share(list);
    } catch {
      setError(g.prepareFailed);
      setStatus("error");
    }
  }

  const text =
    status === "loading"
      ? g.preparing
      : status === "ready"
        ? g.readyTap
        : status === "done"
          ? g.doneBang
          : (label ?? defaultLabel);

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={onClick} disabled={status === "loading"} className={`whitespace-nowrap ${className}`}>
        {text}
      </button>
      {error ? <span className="mt-1 max-w-[16rem] text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
