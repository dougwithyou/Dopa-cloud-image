"use client";

import { useState, useTransition } from "react";
import { formatBytes } from "@/lib/format";
import { MAX_CAROUSEL_ITEMS } from "@/lib/constants";
import { addAssetsToPost, createPostFromAssets, deleteAssets } from "../../actions";

export interface LibraryItem {
  id: string;
  kind: "photo" | "video";
  file_name: string;
  size_bytes: number;
  upload_status: "pending" | "complete";
  url: string | null;
  /** Número de la publicación en la que está (1, 2, …) o null si está libre. */
  postNumber: number | null;
}

type Notice = { error?: string; message?: string } | null;

function Thumb({ item }: { item: LibraryItem }) {
  if (!item.url) {
    return <span className="flex h-full w-full items-center justify-center bg-neutral-100 text-[11px] text-amber-700">Subiendo…</span>;
  }
  return item.kind === "photo" ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
    <img src={item.url} alt={item.file_name} loading="lazy" className="h-full w-full object-cover" />
  ) : (
    <span className="relative block h-full w-full">
      <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center text-2xl text-white drop-shadow">▶</span>
    </span>
  );
}

/**
 * Biblioteca del proyecto: todo el material subido. En plantilla "feed", el
 * creador selecciona archivos (en orden) y crea publicaciones o carruseles.
 * En plantilla "galería", el cliente ve la biblioteca completa.
 */
export function MediaLibrary({
  projectId,
  template,
  items,
  posts,
}: {
  projectId: string;
  template: "feed" | "gallery";
  items: LibraryItem[];
  posts: { id: string; label: string }[];
}) {
  const isFeed = template === "feed";
  const groupLabel = isFeed ? "Publicación" : "Escena";
  const [selected, setSelected] = useState<string[]>([]);
  const [showUsed, setShowUsed] = useState(true);
  const [caption, setCaption] = useState("");
  const [targetPost, setTargetPost] = useState(posts[0]?.id ?? "");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  const free = items.filter((i) => i.postNumber === null);
  const visible = showUsed ? items : free;
  const n = selected.length;

  function toggle(item: LibraryItem) {
    if (item.upload_status !== "complete") return;
    if (item.postNumber !== null) return; // ya está en una publicación o escena
    setNotice(null);
    setSelected((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]));
  }

  function run(action: () => Promise<Notice>) {
    startTransition(async () => {
      const result = await action();
      setNotice(result);
      if (!result?.error) {
        setSelected([]);
        setCaption("");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-neutral-600">
          {items.length} {items.length === 1 ? "archivo" : "archivos"}
          {` · ${free.length} ${isFeed ? "sin usar" : "sin escena"}`}
        </p>
        <label className="flex items-center gap-2 text-neutral-600">
          <input type="checkbox" checked={showUsed} onChange={(e) => setShowUsed(e.target.checked)} />
          {isFeed ? "Mostrar también los que ya están en publicaciones" : "Mostrar también los que ya están en escenas"}
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500">
          {items.length === 0
            ? "Todavía no hay material. Súbelo arriba."
            : isFeed
              ? "Todo el material ya está en publicaciones."
              : "Todas las fotos ya están en escenas."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {visible.map((item) => {
            const order = selected.indexOf(item.id);
            const isSelected = order >= 0;
            const locked = item.upload_status !== "complete" || item.postNumber !== null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  disabled={locked}
                  title={item.file_name}
                  className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-neutral-100 transition ${
                    isSelected ? "ring-4 ring-brand-500" : "ring-1 ring-neutral-200 hover:ring-neutral-400"
                  } ${locked ? "cursor-default opacity-60" : ""}`}
                >
                  <Thumb item={item} />
                  {isSelected ? (
                    <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white shadow">
                      {order + 1}
                    </span>
                  ) : !locked ? (
                    <span className="absolute left-1.5 top-1.5 h-6 w-6 rounded-full border-2 border-white bg-black/20 shadow" />
                  ) : null}
                  {item.postNumber !== null ? (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {groupLabel} {item.postNumber}
                    </span>
                  ) : null}
                </button>
                <p className="mt-1 truncate text-[11px] text-neutral-500">
                  {item.file_name} · {formatBytes(item.size_bytes)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {notice?.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice.error}</p> : null}
      {notice?.message ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice.message}</p> : null}

      {n > 0 ? (
        <div className="sticky bottom-3 z-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {n} seleccionado{n === 1 ? "" : "s"}
              {isFeed && n > 1 ? <span className="font-normal text-neutral-500"> · el orden de los números será el del carrusel</span> : null}
            </p>
            <button type="button" className="text-sm text-neutral-500 hover:text-neutral-900" onClick={() => setSelected([])}>
              Quitar selección
            </button>
          </div>

          {isFeed ? (
            <div className="mt-3 space-y-3">
              <textarea
                className="input min-h-20 text-sm"
                placeholder="Copy de la publicación (opcional, también puedes escribirlo después)"
                value={caption}
                maxLength={10000}
                onChange={(e) => setCaption(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-brand"
                  disabled={pending || n > MAX_CAROUSEL_ITEMS}
                  onClick={() => run(() => createPostFromAssets({ projectId, assetIds: selected, caption }))}
                >
                  {pending ? "Creando…" : n === 1 ? "Crear publicación" : `Crear carrusel (${n})`}
                </button>
                {posts.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-neutral-500">o añadir a</span>
                    <select className="input w-auto py-1.5" value={targetPost} onChange={(e) => setTargetPost(e.target.value)}>
                      {posts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={pending || !targetPost}
                      onClick={() => run(() => addAssetsToPost({ postId: targetPost, assetIds: selected }))}
                    >
                      Añadir
                    </button>
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost ml-auto text-red-600"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${n} archivo(s) definitivamente? No se puede deshacer.`)) {
                      run(() => deleteAssets({ assetIds: selected }));
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>
              {n > MAX_CAROUSEL_ITEMS ? (
                <p className="text-xs text-amber-700">Un carrusel admite como máximo {MAX_CAROUSEL_ITEMS} archivos.</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <input
                className="input text-sm"
                placeholder="Título de la escena (p. ej. Ceremonia, Recepción, Retratos)"
                value={caption}
                maxLength={80}
                onChange={(e) => setCaption(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-brand"
                  disabled={pending || !caption.trim()}
                  onClick={() => run(() => createPostFromAssets({ projectId, assetIds: selected, caption }))}
                >
                  {pending ? "Creando…" : `Crear escena (${n})`}
                </button>
                {posts.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <span className="text-sm text-neutral-500">o añadir a</span>
                    <select className="input w-auto py-1.5" value={targetPost} onChange={(e) => setTargetPost(e.target.value)}>
                      {posts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={pending || !targetPost}
                      onClick={() => run(() => addAssetsToPost({ postId: targetPost, assetIds: selected }))}
                    >
                      Añadir
                    </button>
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost ml-auto text-red-600"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${n} archivo(s) de la galería definitivamente? No se puede deshacer.`)) {
                      run(() => deleteAssets({ assetIds: selected }));
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>
              <p className="text-xs text-neutral-500">Las escenas son opcionales: sin escenas, tu cliente ve todas las fotos juntas.</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
