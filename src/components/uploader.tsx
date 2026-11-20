"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes } from "@/lib/format";
import { MAX_CAROUSEL_ITEMS } from "@/lib/constants";

// Subida multipart directa del navegador a R2. Next.js solo firma las partes:
// los bytes nunca pasan por Vercel.
//
// Cada archivo pertenece a una publicación:
//  - "separate": se crea una publicación por archivo.
//  - "carousel": se crea UNA publicación para todos los archivos (máx. 20).
//  - targetPostId: se agregan a una publicación existente (completar un carrusel).

const CONCURRENCY_FILES = 2;
const CONCURRENCY_PARTS = 4;
const SIGN_BATCH = 20;
const MAX_RETRIES = 3;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
};

function mimeFor(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

type Mode = "separate" | "carousel";
type ItemState = "queued" | "uploading" | "done" | "error" | "canceled";

interface Item {
  id: string;
  file: File;
  progress: number; // 0..1
  state: ItemState;
  error?: string;
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

function putPart(url: string, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          reject(new Error("R2 no expuso el ETag (revisa la configuración CORS del bucket)"));
          return;
        }
        resolve(etag);
      } else {
        reject(new Error(`Fallo al subir parte (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.onabort = () => reject(new DOMException("Cancelado", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/** Reserva el archivo en el servidor (crea el asset 'pending' y el multipart en R2). */
function startUpload(postId: string, file: File, signal: AbortSignal) {
  return postJson<{ assetId: string; partSize: number; partCount: number }>(
    "/api/uploads",
    { postId, fileName: file.name, mimeType: mimeFor(file), size: file.size },
    signal,
  );
}

/** Sube los bytes de un archivo ya reservado y lo marca como completo. */
async function transfer(
  started: { assetId: string; partSize: number; partCount: number },
  file: File,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const { assetId, partSize, partCount } = started;
  if (signal.aborted) {
    // Cancelado mientras esperaba turno: liberar la reserva.
    await fetch(`/api/uploads/${assetId}`, { method: "DELETE" }).catch(() => undefined);
    throw new DOMException("Cancelado", "AbortError");
  }
  const loaded = new Array<number>(partCount).fill(0);
  const report = () => onProgress(loaded.reduce((a, b) => a + b, 0) / file.size);

  // Firma de URLs por lotes, bajo demanda.
  const batches = new Map<number, Promise<Map<number, string>>>();
  const urlFor = (partNumber: number) => {
    const batch = Math.floor((partNumber - 1) / SIGN_BATCH);
    if (!batches.has(batch)) {
      const first = batch * SIGN_BATCH + 1;
      const numbers = Array.from({ length: Math.min(SIGN_BATCH, partCount - first + 1) }, (_, i) => first + i);
      batches.set(
        batch,
        postJson<{ urls: { partNumber: number; url: string }[] }>(
          `/api/uploads/${assetId}/parts`,
          { partNumbers: numbers },
          signal,
        ).then((r) => new Map(r.urls.map((u) => [u.partNumber, u.url]))),
      );
    }
    return batches.get(batch)!.then((m) => m.get(partNumber)!);
  };

  const parts: { partNumber: number; etag: string }[] = [];
  const queue = Array.from({ length: partCount }, (_, i) => i + 1);

  const worker = async () => {
    while (queue.length > 0) {
      const partNumber = queue.shift()!;
      const start = (partNumber - 1) * partSize;
      const blob = file.slice(start, Math.min(start + partSize, file.size));
      let attempt = 0;
      for (;;) {
        try {
          const url = await urlFor(partNumber);
          const etag = await putPart(
            url,
            blob,
            (l) => {
              loaded[partNumber - 1] = l;
              report();
            },
            signal,
          );
          loaded[partNumber - 1] = blob.size;
          report();
          parts.push({ partNumber, etag });
          break;
        } catch (err) {
          if ((err as Error).name === "AbortError" || ++attempt >= MAX_RETRIES) throw err;
          loaded[partNumber - 1] = 0;
          await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY_PARTS, partCount) }, worker));
    await postJson(`/api/uploads/${assetId}/complete`, { parts }, signal);
  } catch (err) {
    // Libera el espacio reservado y las partes en R2.
    await fetch(`/api/uploads/${assetId}`, { method: "DELETE" }).catch(() => undefined);
    throw err;
  }
}

export function Uploader({
  projectId,
  accept,
  disabledReason,
  targetPostId,
  remainingSlots,
}: {
  projectId: string;
  accept: string;
  disabledReason?: string;
  /** Si se indica, los archivos se agregan a esta publicación (carrusel existente). */
  targetPostId?: string;
  /** Espacios libres en el carrusel destino (20 - archivos actuales). */
  remainingSlots?: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("separate");
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const start = useCallback(
    async (files: File[]) => {
      if (disabledReason || files.length === 0) return;
      setNotice(null);

      const asCarousel = Boolean(targetPostId) || mode === "carousel";
      const limit = targetPostId ? (remainingSlots ?? MAX_CAROUSEL_ITEMS) : MAX_CAROUSEL_ITEMS;
      if (asCarousel && files.length > limit) {
        setNotice(
          targetPostId
            ? `Este carrusel admite ${limit} archivo(s) más (máximo ${MAX_CAROUSEL_ITEMS}).`
            : `Un carrusel admite como máximo ${MAX_CAROUSEL_ITEMS} archivos. Seleccionaste ${files.length}.`,
        );
        return;
      }

      const newItems: Item[] = files.map((file) => ({ id: crypto.randomUUID(), file, progress: 0, state: "queued" }));
      setItems((prev) => [...newItems, ...prev]);

      // 1) Publicaciones: una por archivo, una para todo el carrusel, o la existente.
      const postFor = new Map<string, string>();
      const createdPosts = new Set<string>();
      try {
        if (targetPostId) {
          newItems.forEach((it) => postFor.set(it.id, targetPostId));
        } else if (mode === "carousel") {
          const { postId } = await postJson<{ postId: string }>("/api/posts", { projectId });
          createdPosts.add(postId);
          newItems.forEach((it) => postFor.set(it.id, postId));
        } else {
          for (const it of newItems) {
            const { postId } = await postJson<{ postId: string }>("/api/posts", { projectId });
            createdPosts.add(postId);
            postFor.set(it.id, postId);
          }
        }
      } catch (err) {
        newItems.forEach((it) => update(it.id, { state: "error", error: (err as Error).message }));
        return;
      }

      // 2) Reservas en orden (así el carrusel respeta el orden de selección) y
      //    transferencias en paralelo.
      let reserveChain: Promise<unknown> = Promise.resolve();
      const reserveInOrder = <T,>(fn: () => Promise<T>) => {
        const next = reserveChain.then(fn, fn);
        reserveChain = next.catch(() => undefined);
        return next;
      };
      const reservations = new Map(
        newItems.map((it) => {
          const controller = new AbortController();
          controllers.current.set(it.id, controller);
          return [
            it.id,
            reserveInOrder(() => startUpload(postFor.get(it.id)!, it.file, controller.signal)),
          ] as const;
        }),
      );

      const succeededPosts = new Set<string>();
      const pending = [...newItems];
      const run = async () => {
        while (pending.length > 0) {
          const item = pending.shift()!;
          const controller = controllers.current.get(item.id)!;
          update(item.id, { state: "uploading" });
          try {
            const started = await reservations.get(item.id)!;
            await transfer(started, item.file, (p) => update(item.id, { progress: p }), controller.signal);
            update(item.id, { state: "done", progress: 1 });
            succeededPosts.add(postFor.get(item.id)!);
          } catch (err) {
            const canceled = (err as Error).name === "AbortError";
            update(item.id, { state: canceled ? "canceled" : "error", error: (err as Error).message });
          } finally {
            controllers.current.delete(item.id);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY_FILES }, run));

      // 3) Publicaciones nuevas que quedaron sin ningún archivo: se eliminan.
      await Promise.all(
        [...createdPosts]
          .filter((id) => !succeededPosts.has(id))
          .map((id) => fetch(`/api/posts/${id}`, { method: "DELETE" }).catch(() => undefined)),
      );
      router.refresh();
    },
    [disabledReason, mode, projectId, remainingSlots, router, targetPostId],
  );

  if (disabledReason) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{disabledReason}</div>;
  }

  const compact = Boolean(targetPostId);

  return (
    <div>
      {!targetPostId ? (
        <fieldset className="mb-3 grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Cómo agrupar los archivos</legend>
          {(
            [
              ["separate", "Publicaciones separadas", "Cada archivo es su propia publicación, con su propio copy."],
              ["carousel", "Carrusel", `Todos los archivos van juntos en una publicación con un solo copy (máx. ${MAX_CAROUSEL_ITEMS}).`],
            ] as const
          ).map(([value, title, help]) => (
            <label
              key={value}
              className="card flex cursor-pointer gap-3 p-3 transition has-[:checked]:border-neutral-900 has-[:checked]:ring-2 has-[:checked]:ring-neutral-900/10"
            >
              <input
                type="radio"
                name="upload-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-neutral-500">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void start(Array.from(e.dataTransfer.files));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition ${
          compact ? "py-4" : "py-10"
        } ${dragging ? "border-brand-500 bg-brand-50" : "border-neutral-300 bg-white hover:border-neutral-400"}`}
      >
        <p className="text-sm font-semibold">
          {targetPostId
            ? "+ Añadir fotos o videos a este carrusel"
            : mode === "carousel"
              ? "Arrastra aquí las fotos y videos del carrusel"
              : "Arrastra aquí fotos y videos"}
        </p>
        {!compact ? (
          <p className="mt-1 text-sm text-neutral-500">
            o haz clic para elegirlos · JPG, PNG, HEIC, WEBP, MP4, MOV, WEBM
            {mode === "carousel" ? " · se respetará el orden en que los selecciones" : ""}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            void start(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {notice ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p> : null}

      {items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="card p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{item.file.name}</span>
                <span className="shrink-0 text-xs text-neutral-500">
                  {item.state === "done"
                    ? "Listo"
                    : item.state === "error"
                      ? "Error"
                      : item.state === "canceled"
                        ? "Cancelado"
                        : item.state === "queued"
                          ? "En cola"
                          : `${Math.floor(item.progress * 100)}% de ${formatBytes(item.file.size)}`}
                </span>
                {item.state === "uploading" || item.state === "queued" ? (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-red-600 hover:underline"
                    onClick={() => controllers.current.get(item.id)?.abort()}
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full transition-all ${item.state === "error" ? "bg-red-500" : item.state === "done" ? "bg-green-500" : "bg-neutral-900"}`}
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
              {item.error && item.state === "error" ? <p className="mt-1 text-xs text-red-600">{item.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
