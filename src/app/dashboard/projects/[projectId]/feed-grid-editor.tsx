"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaCarousel } from "@/components/media-carousel";
import { formatBytes } from "@/lib/format";
import { deletePost, moveAsset, removeAssetFromPost, reorderPosts, updatePostCaption } from "../../actions";
import type { EditorAsset, EditorPost } from "./post-card";

function CarouselIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 drop-shadow" fill="white" aria-label="Carrusel">
      <path d="M8 3h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-1V7a2 2 0 0 0-2-2H6V5a2 2 0 0 1 2-2Z" />
      <rect x="3" y="7" width="13" height="14" rx="2" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 drop-shadow" fill="white" aria-label="Video">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function Thumb({ asset }: { asset: EditorAsset | undefined }) {
  if (!asset?.url) return <span className="flex h-full w-full items-center justify-center bg-neutral-100 text-xs text-neutral-400">Sin archivos</span>;
  return asset.kind === "photo" ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
    <img src={asset.url} alt="" draggable={false} className="pointer-events-none h-full w-full select-none object-cover" />
  ) : (
    <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" />
  );
}

/** Contenido visual de una casilla de la cuadrícula. */
function TileFace({ post, dragging = false }: { post: EditorPost; dragging?: boolean }) {
  const first = post.assets[0];
  return (
    <span className={`relative block aspect-[4/5] w-full overflow-hidden bg-neutral-100 ${dragging ? "shadow-2xl ring-4 ring-brand-500" : ""}`}>
      <Thumb asset={first} />
      <span className="absolute right-2 top-2">
        {post.assets.length > 1 ? <CarouselIcon /> : first?.kind === "video" ? <VideoIcon /> : null}
      </span>
      {!post.caption ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
          Sin copy
        </span>
      ) : null}
    </span>
  );
}

function SortableTile({ post, onOpen }: { post: EditorPost; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: post.id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onOpen}
      style={{ transform: CSS.Transform.toString(transform), transition, touchAction: "manipulation" }}
      className={`block w-full select-none [-webkit-touch-callout:none] ${isDragging ? "opacity-30" : ""}`}
      aria-label="Abrir publicación (mantén presionado para mover)"
      {...attributes}
      {...listeners}
    >
      <TileFace post={post} />
    </button>
  );
}

/** Popup de una publicación: archivos (orden, quitar), copy y eliminar. */
function PostModal({ post, index, onClose }: { post: EditorPost; index: number; onClose: () => void }) {
  const [caption, setCaption] = useState(post.caption ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const count = post.assets.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const form = (entries: Record<string, string>) => {
    const fd = new FormData();
    Object.entries(entries).forEach(([k, v]) => fd.set(k, v));
    return fd;
  };

  const saveCaption = () =>
    startTransition(async () => {
      await updatePostCaption(form({ postId: post.id, caption }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  const dirty = caption.trim() !== (post.caption ?? "").trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal>
      <div
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 bg-black md:w-1/2">
          {count > 0 ? (
            <div className="h-[38dvh] md:h-full md:min-h-[480px]">
              <MediaCarousel key={post.assets.map((a) => a.id).join()} media={post.assets.filter((a): a is EditorAsset & { url: string } => !!a.url)} fit="fill" dark />
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-white/70">Esta publicación no tiene archivos</div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <p className="text-sm font-semibold">
              Publicación {index + 1}
              <span className="ml-2 font-normal text-neutral-500">
                {count > 1 ? `Carrusel · ${count}` : post.assets[0]?.kind === "video" ? "Video" : "Foto"}
              </span>
            </p>
            <button type="button" onClick={onClose} className="px-2 text-2xl leading-none text-neutral-500" aria-label="Cerrar">
              ×
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {count > 1 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-neutral-500">Orden del carrusel</p>
                <ol className="flex gap-2 overflow-x-auto pb-1">
                  {post.assets.map((a, i) => (
                    <li key={a.id} className="w-20 shrink-0">
                      <span className="relative block aspect-square overflow-hidden rounded-md">
                        <Thumb asset={a} />
                        <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                      </span>
                      <span className="mt-1 flex justify-between text-xs">
                        <button
                          type="button"
                          disabled={i === 0 || pending}
                          onClick={() => startTransition(() => moveAsset(form({ assetId: a.id, direction: "left" })))}
                          className="px-1 disabled:opacity-30"
                          aria-label="Mover a la izquierda"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => startTransition(() => removeAssetFromPost(form({ assetId: a.id })))}
                          className="px-1 text-neutral-500"
                          title="Devolver a la biblioteca"
                        >
                          Quitar
                        </button>
                        <button
                          type="button"
                          disabled={i === count - 1 || pending}
                          onClick={() => startTransition(() => moveAsset(form({ assetId: a.id, direction: "right" })))}
                          className="px-1 disabled:opacity-30"
                          aria-label="Mover a la derecha"
                        >
                          →
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-[11px] text-neutral-400">“Quitar” devuelve el archivo a la biblioteca sin borrarlo.</p>
              </div>
            ) : count === 1 ? (
              <p className="truncate text-xs text-neutral-500">
                {post.assets[0].file_name} · {formatBytes(post.assets[0].size_bytes)}
              </p>
            ) : null}

            <div>
              <label className="label" htmlFor="modal-caption">Copy de esta publicación</label>
              <textarea
                id="modal-caption"
                className="input min-h-44 text-sm"
                value={caption}
                maxLength={10000}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={count > 1 ? "Texto para todo el carrusel: caption, hashtags, menciones…" : "Caption, hashtags, menciones…"}
              />
              <p className="mt-1 text-right text-[11px] text-neutral-400">{caption.length} / 2.200 en Instagram</p>
            </div>
          </div>

          <footer className="flex items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3">
            <button
              type="button"
              className="btn-ghost px-2 text-xs text-red-600"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`¿Eliminar la publicación ${index + 1}? Sus archivos vuelven a la biblioteca; el copy se pierde.`)) {
                  startTransition(async () => {
                    await deletePost(form({ postId: post.id }));
                    onClose();
                  });
                }
              }}
            >
              Eliminar publicación
            </button>
            <button type="button" className="btn-primary" disabled={pending || !dirty} onClick={saveCaption}>
              {pending ? "Guardando…" : saved ? "¡Guardado!" : "Guardar copy"}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

/**
 * Cuadrícula del feed tal como la verá el cliente. Arrastrar para ordenar
 * (en el teléfono: mantener presionado y arrastrar); tocar para abrir el popup.
 */
export function FeedGridEditor({ projectId, posts }: { projectId: string; posts: EditorPost[] }) {
  const [order, setOrder] = useState(posts.map((p) => p.id));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error?: string; message?: string } | null>(null);
  const [, startTransition] = useTransition();

  // Si el servidor trae otra lista (publicación nueva o eliminada), se resincroniza.
  const serverKey = posts.map((p) => p.id).join();
  useEffect(() => setOrder(posts.map((p) => p.id)), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(posts.map((p) => [p.id, p]));
  const ordered = order.map((id) => byId.get(id)).filter((p): p is EditorPost => !!p);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Mantener presionado para arrastrar: así el desplazamiento normal sigue funcionando.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setNotice(null);
    navigator.vibrate?.(10);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    startTransition(async () => {
      const result = await reorderPosts({ projectId, postIds: next });
      setNotice(result);
      if (result?.error) setOrder(posts.map((p) => p.id));
    });
  }

  const active = activeId ? byId.get(activeId) : null;
  const openIndex = openId ? ordered.findIndex((p) => p.id === openId) : -1;
  const openPost = openIndex >= 0 ? ordered[openIndex] : null;

  return (
    <div>
      <div className="mx-auto max-w-[600px] overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-3 gap-[3px]">
              {ordered.map((post) => (
                <SortableTile key={post.id} post={post} onOpen={() => setOpenId(post.id)} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>{active ? <TileFace post={active} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>
      <p className="mt-2 text-center text-xs text-neutral-500">
        Toca una publicación para ver y editar su copy. Para cambiar el orden, mantén presionada una publicación y arrástrala.
      </p>
      {notice?.error ? <p className="mt-2 text-center text-sm text-red-600">{notice.error}</p> : null}
      {notice?.message ? <p className="mt-2 text-center text-sm text-green-700">{notice.message}</p> : null}

      {openPost ? <PostModal key={openPost.id} post={openPost} index={openIndex} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}
