"use client";

import { useEffect, useRef, useState } from "react";

/** Número de columnas del mosaico según el ancho de pantalla. */
function useColumnCount() {
  const [count, setCount] = useState(3);
  useEffect(() => {
    const update = () => setCount(window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}
import { DownloadAllButton } from "@/components/download-all-button";
import { downloadHref, type FeedMedia } from "@/components/feed-post";
import { pad, slugify, type ZipEntry } from "@/lib/zip-download";

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Visor a pantalla completa: flechas, teclado, deslizar con el dedo y descarga. */
function Lightbox({
  items,
  index,
  onClose,
  onNavigate,
}: {
  items: FeedMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const item = items[index];
  const touchX = useRef<number | null>(null);
  const prev = () => index > 0 && onNavigate(index - 1);
  const next = () => index < items.length - 1 && onNavigate(index + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white"
      role="dialog"
      aria-modal
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 50) prev();
        if (dx < -50) next();
        touchX.current = null;
      }}
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-4 text-sm">
        <span className="tabular-nums text-white/70">
          {index + 1} / {items.length}
        </span>
        <div className="flex items-center gap-2">
          <a
            href={downloadHref(item.id)}
            download
            className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            <DownloadIcon /> Descargar
          </a>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="px-2 text-3xl leading-none text-white/80 hover:text-white">
            ×
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6 sm:px-16">
        {item.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
          <img key={item.id} src={item.url} alt={item.file_name} className="max-h-full max-w-full object-contain" />
        ) : (
          <video key={item.id} src={item.url} controls autoPlay playsInline className="max-h-full max-w-full" />
        )}
        {index > 0 ? (
          <button
            type="button"
            onClick={prev}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-3xl text-white/70 hover:bg-white/10 hover:text-white sm:flex"
          >
            ‹
          </button>
        ) : null}
        {index < items.length - 1 ? (
          <button
            type="button"
            onClick={next}
            aria-label="Siguiente"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-3xl text-white/70 hover:bg-white/10 hover:text-white sm:flex"
          >
            ›
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Plantilla "Galería de fotos" (estilo Pixieset): portada a pantalla completa,
 * mosaico respetando la proporción de cada foto y visor con descarga.
 */
export function PhotoGalleryTemplate({
  title,
  authorName,
  date,
  items,
}: {
  title: string;
  authorName: string;
  date: string;
  items: FeedMedia[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const columnCount = useColumnCount();
  // Reparto en columnas de izquierda a derecha (1, 2, 3, 4 en la primera fila),
  // como en las galerías profesionales.
  const columns = Array.from({ length: columnCount }, (_, c) =>
    items.map((m, i) => ({ m, i })).filter(({ i }) => i % columnCount === c),
  );
  const cover = items.find((m) => m.kind === "photo") ?? items[0];
  const zipPrefix = slugify(title);
  const entries: ZipEntry[] = items.map((m, i) => ({
    name: `${pad(i + 1, 3)}-${m.file_name}`,
    url: m.url,
    size: m.size_bytes,
    downloadHref: downloadHref(m.id),
  }));

  return (
    <div className="bg-white">
      {/* Portada */}
      <section className="relative flex h-[70vh] min-h-[420px] items-center justify-center overflow-hidden bg-neutral-900 sm:h-[88vh]">
        {cover ? (
          cover.kind === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
            <img src={cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <video src={`${cover.url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
          )
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/60" />
        <div className="relative px-6 text-center text-white">
          <h1 className="font-serif text-4xl uppercase tracking-[0.2em] sm:text-6xl">{title}</h1>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-white/80 sm:text-sm">
            {authorName} · {date}
          </p>
          <a
            href="#galeria"
            className="mt-8 inline-block border border-white/80 px-6 py-2.5 text-xs uppercase tracking-[0.3em] transition hover:bg-white hover:text-neutral-900"
          >
            Ver galería
          </a>
        </div>
      </section>

      {/* Barra */}
      <div id="galeria" className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="min-w-0">
            <p className="truncate font-serif text-lg uppercase tracking-[0.15em]">{title}</p>
            <p className="text-xs text-neutral-500">
              {items.length} {items.length === 1 ? "archivo" : "archivos"} · {authorName}
            </p>
          </div>
          <DownloadAllButton
            entries={entries}
            zipName={`${zipPrefix}.zip`}
            label="↓ Descargar todo"
            className="btn-primary shrink-0 whitespace-nowrap rounded-none px-3 py-2 text-[11px] uppercase tracking-widest sm:px-4 sm:text-xs"
          />
        </div>
      </div>

      {/* Mosaico */}
      <section className="mx-auto max-w-7xl px-2 py-4 sm:px-8 sm:py-8">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">Esta galería todavía no tiene fotos.</p>
        ) : (
          <div className="flex gap-2 sm:gap-3">
            {columns.map((column, c) => (
              <div key={c} className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
            {column.map(({ m, i }) => (
              <div key={m.id} className="group relative">
                <button type="button" onClick={() => setOpen(i)} className="block w-full" aria-label={`Ver ${m.file_name}`}>
                  {m.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
                    <img src={m.url} alt={m.file_name} loading={i < 8 ? "eager" : "lazy"} className="block h-auto w-full bg-neutral-100" />
                  ) : (
                    <span className="relative block">
                      <video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" className="block h-auto w-full bg-neutral-900" />
                      <span className="absolute inset-0 flex items-center justify-center text-4xl text-white drop-shadow">▶</span>
                    </span>
                  )}
                </button>
                <a
                  href={downloadHref(m.id)}
                  download
                  aria-label={`Descargar ${m.file_name}`}
                  className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-neutral-900 opacity-100 shadow transition sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <DownloadIcon />
                </a>
              </div>
            ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="py-10 text-center text-xs uppercase tracking-[0.3em] text-neutral-400">{authorName}</footer>

      {open !== null ? (
        <Lightbox items={items} index={open} onClose={() => setOpen(null)} onNavigate={setOpen} />
      ) : null}
    </div>
  );
}
