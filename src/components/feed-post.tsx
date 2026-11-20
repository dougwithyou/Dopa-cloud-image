"use client";

import { useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";

export interface FeedMedia {
  id: string;
  kind: "photo" | "video";
  file_name: string;
  url: string;
}

export interface FeedPostData {
  id: string;
  caption: string | null;
  media: FeedMedia[];
}

function downloadUrl(id: string) {
  return `/api/assets/${id}/download`;
}

/** Publicación estilo Instagram: una foto/video o un carrusel deslizable, con su copy. */
export function FeedPost({ post, authorName, index }: { post: FeedPostData; authorName: string; index: number }) {
  const [current, setCurrent] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const count = post.media.length;
  const isCarousel = count > 1;
  const active = post.media[current];

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  // Descarga cada archivo del carrusel. El navegador puede pedir permiso
  // para descargas múltiples la primera vez.
  async function downloadAll() {
    setDownloadingAll(true);
    for (const m of post.media) {
      const a = document.createElement("a");
      a.href = downloadUrl(m.id);
      a.download = m.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 700));
    }
    setDownloadingAll(false);
  }

  return (
    <article className="overflow-hidden border-neutral-200 bg-white sm:rounded-2xl sm:border">
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-brand-500 to-purple-600 p-[2px]">
          <span className="flex h-full w-full items-center justify-center rounded-full bg-white text-xs font-bold">
            {authorName.slice(0, 1).toUpperCase()}
          </span>
        </span>
        <span className="text-sm font-semibold">{authorName}</span>
        <span className="ml-auto text-xs text-neutral-400">
          {isCarousel ? `Carrusel · ${count}` : `#${index + 1}`}
        </span>
      </header>

      {count > 0 ? (
        <div className="relative bg-neutral-100">
          <div
            ref={track}
            onScroll={(e) => {
              const el = e.currentTarget;
              setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
            }}
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {post.media.map((m, i) => (
              <div key={m.id} className="w-full shrink-0 snap-center">
                {m.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
                  <img
                    src={m.url}
                    alt={m.file_name}
                    loading={index < 2 && i === 0 ? "eager" : "lazy"}
                    className={`block w-full object-contain ${isCarousel ? "aspect-[4/5]" : "max-h-[80vh]"}`}
                  />
                ) : (
                  <video
                    src={m.url}
                    controls
                    playsInline
                    preload="metadata"
                    className={`block w-full bg-black object-contain ${isCarousel ? "aspect-[4/5]" : "max-h-[80vh]"}`}
                  />
                )}
              </div>
            ))}
          </div>

          {isCarousel ? (
            <>
              <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                {current + 1}/{count}
              </span>
              {current > 0 ? (
                <button
                  type="button"
                  onClick={() => goTo(current - 1)}
                  aria-label="Anterior"
                  className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow sm:flex"
                >
                  ‹
                </button>
              ) : null}
              {current < count - 1 ? (
                <button
                  type="button"
                  onClick={() => goTo(current + 1)}
                  aria-label="Siguiente"
                  className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow sm:flex"
                >
                  ›
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {isCarousel ? (
        <div className="flex justify-center gap-1 pt-3" aria-hidden>
          {post.media.map((m, i) => (
            <span key={m.id} className={`h-1.5 w-1.5 rounded-full ${i === current ? "bg-brand-500" : "bg-neutral-300"}`} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {active ? (
          <a href={downloadUrl(active.id)} className="btn-primary px-3 py-1.5 text-xs" download>
            ↓ Descargar {active.kind === "video" ? "video" : "foto"}
            {isCarousel ? ` ${current + 1}/${count}` : ""}
          </a>
        ) : null}
        {isCarousel ? (
          <button type="button" onClick={downloadAll} disabled={downloadingAll} className="btn-secondary px-3 py-1.5 text-xs">
            {downloadingAll ? "Descargando…" : `↓ Descargar todo (${count})`}
          </button>
        ) : null}
        {post.caption ? <CopyButton text={post.caption} className="btn-secondary px-3 py-1.5 text-xs" label="Copiar copy" /> : null}
      </div>

      {post.caption ? (
        <p className="whitespace-pre-wrap px-4 pt-3 text-sm">
          <span className="mr-1 font-semibold">{authorName}</span>
          {post.caption}
        </p>
      ) : null}
      <div className="pb-4" />
    </article>
  );
}
