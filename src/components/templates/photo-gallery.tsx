"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DownloadAllButton } from "@/components/download-all-button";
import { downloadHref as defaultDownloadHref, type FeedMedia } from "@/components/feed-post";
import { pad, slugify, type ZipEntry } from "@/lib/zip-download";
import { SaveToPhotosButton, useSaveToPhotosPlatform } from "@/components/save-to-photos";
import { BuyPrintDialog, CartButton } from "@/components/store/buy-print-dialog";
import { isPrintable, type StoreConfig } from "@/lib/store-types";
import {
  FONTS,
  GAP_PX,
  GOOGLE_FONTS_HREF,
  PALETTES,
  columnsFor,
  type GalleryDesign,
} from "@/lib/gallery-design";

export interface GalleryScene {
  id: string;
  title: string;
  media: FeedMedia[];
}

/**
 * Columnas del mosaico según el tamaño elegido y el ancho del CONTENEDOR (no
 * de la ventana), para que la vista previa del editor sea fiel.
 */
function useColumnCount(size: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width + 64));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, count: columnsFor(size, width) };
}

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
  hrefFor,
  store,
}: {
  items: FeedMedia[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  hrefFor: (id: string) => string;
  store?: StoreConfig | null;
}) {
  const item = items[index];
  const [buying, setBuying] = useState(false);
  const canBuy = Boolean(store) && isPrintable(item);
  const touchX = useRef<number | null>(null);
  const prev = () => index > 0 && onNavigate(index - 1);
  const next = () => index < items.length - 1 && onNavigate(index + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (buying) return;
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
          {canBuy ? (
            <button
              type="button"
              onClick={() => setBuying(true)}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900"
            >
              Comprar impresión
            </button>
          ) : null}
          <SaveToPhotosButton
            media={[item]}
            className={canBuy ? "rounded-full border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10" : "rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900"}
          />
          <a
            href={hrefFor(item.id)}
            download
            className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1.5 text-xs hover:bg-white/10"
          >
            <DownloadIcon /> <span className={canBuy ? "hidden sm:inline" : ""}>Descargar</span>
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
      {buying && store ? <BuyPrintDialog media={item} store={store} onClose={() => setBuying(false)} /> : null}
    </div>
  );
}

/** Tipografía del título según el estilo. */
function titleStyle(design: GalleryDesign): CSSProperties {
  const family = FONTS[design.font].family;
  if (design.style === "editorial") return { fontFamily: family, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 400 };
  if (design.style === "airy") return { fontFamily: family, letterSpacing: "0.04em", fontWeight: 300 };
  return { fontFamily: family, fontWeight: 500 };
}

function CoverMedia({ item, className }: { item: FeedMedia | undefined; className: string }) {
  if (!item) return <div className={`bg-neutral-300 ${className}`} />;
  return item.kind === "photo" ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
    <img src={item.url} alt="" className={`object-cover ${className}`} />
  ) : (
    <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className={`object-cover ${className}`} />
  );
}

/** Portada según el diseño: pantalla completa, dividida o con marco. */
function Cover({
  design,
  title,
  subtitle,
  cover,
}: {
  design: GalleryDesign;
  title: string;
  subtitle: string;
  cover: FeedMedia | undefined;
}) {
  const palette = PALETTES[design.palette];
  const ts = titleStyle(design);
  const cta = (light: boolean) => (
    <a
      href="#galeria"
      className="mt-8 inline-block border px-6 py-2.5 text-xs uppercase tracking-[0.3em] transition hover:opacity-70"
      style={{ borderColor: light ? "rgba(255,255,255,.8)" : palette.text, color: light ? "#fff" : palette.text }}
    >
      Ver galería
    </a>
  );

  if (design.cover === "split") {
    return (
      <section className="grid min-h-[80vh] md:grid-cols-2" style={{ background: palette.surface }}>
        <div className="order-2 flex flex-col justify-center px-8 py-14 md:order-1 md:px-16">
          <h1 className="text-4xl leading-tight sm:text-6xl" style={ts}>
            {title}
          </h1>
          <p className="mt-5 text-xs uppercase tracking-[0.3em]" style={{ color: palette.muted }}>
            {subtitle}
          </p>
          <div>{cta(false)}</div>
        </div>
        <CoverMedia item={cover} className="order-1 h-[55vh] w-full md:order-2 md:h-full" />
      </section>
    );
  }

  if (design.cover === "frame") {
    return (
      <section className="px-4 pb-10 pt-14 text-center sm:px-10 sm:pt-20" style={{ background: palette.bg }}>
        <h1 className="text-4xl sm:text-6xl" style={ts}>
          {title}
        </h1>
        <p className="mt-4 text-xs uppercase tracking-[0.3em]" style={{ color: palette.muted }}>
          {subtitle}
        </p>
        <div className="mx-auto mt-10 max-w-5xl p-2 sm:p-3" style={{ background: palette.surface, boxShadow: `0 0 0 1px ${palette.accent}` }}>
          <CoverMedia item={cover} className="aspect-[3/2] w-full" />
        </div>
        {cta(false)}
      </section>
    );
  }

  return (
    <section className="relative flex h-[70vh] min-h-[420px] items-center justify-center overflow-hidden bg-neutral-900 sm:h-[88vh]">
      <CoverMedia item={cover} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/60" />
      <div className="relative px-6 text-center text-white">
        <h1 className="text-4xl sm:text-6xl" style={ts}>
          {title}
        </h1>
        <p className="mt-4 text-xs uppercase tracking-[0.3em] text-white/80 sm:text-sm">{subtitle}</p>
        {cta(true)}
      </div>
    </section>
  );
}

/** Mosaico ordenado de izquierda a derecha. */
function Masonry({
  items,
  offset,
  design,
  onOpen,
  hrefFor,
}: {
  items: FeedMedia[];
  offset: number;
  design: GalleryDesign;
  onOpen: (index: number) => void;
  hrefFor: (id: string) => string;
}) {
  const { ref, count: columnCount } = useColumnCount(design.size);
  // En el teléfono se guarda desde el visor ("Guardar en Fotos"); el ícono de
  // descarga directa enviaría el archivo a la app Archivos.
  const mobile = useSaveToPhotosPlatform() !== null;
  const gap = GAP_PX[design.spacing] ?? 10;
  const columns = Array.from({ length: columnCount }, (_, c) =>
    items.map((m, i) => ({ m, i })).filter(({ i }) => i % columnCount === c),
  );
  return (
    <div ref={ref} className="flex" style={{ gap }}>
      {columns.map((column, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          {column.map(({ m, i }) => (
            <div key={m.id} className="group relative">
              <button type="button" onClick={() => onOpen(offset + i)} className="block w-full" aria-label={`Ver ${m.file_name}`}>
                {m.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
                  <img src={m.url} alt={m.file_name} loading={offset + i < 8 ? "eager" : "lazy"} className="block h-auto w-full bg-black/5" />
                ) : (
                  <span className="relative block">
                    <video src={`${m.url}#t=0.1`} muted playsInline preload="metadata" className="block h-auto w-full bg-neutral-900" />
                    <span className="absolute inset-0 flex items-center justify-center text-4xl text-white drop-shadow">▶</span>
                  </span>
                )}
              </button>
              {mobile ? null : (
              <a
                href={hrefFor(m.id)}
                download
                aria-label={`Descargar ${m.file_name}`}
                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-neutral-900 opacity-100 shadow transition sm:opacity-0 sm:group-hover:opacity-100"
              >
                <DownloadIcon />
              </a>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Plantilla "Galería de fotos" (estilo Pixieset), personalizable desde el
 * editor de diseño: estilo, paleta, tipografía, portada, tamaño y espaciado.
 * Si hay escenas, se muestran como secciones con título y pestañas.
 */
export function PhotoGalleryTemplate({
  title,
  authorName,
  date,
  items,
  scenes = [],
  design,
  downloadBase,
  store,
}: {
  title: string;
  authorName: string;
  date: string;
  /** Todo el material del proyecto. */
  items: FeedMedia[];
  /** Escenas (publicaciones del proyecto) con sus fotos. */
  scenes?: GalleryScene[];
  design: GalleryDesign;
  /**
   * Ruta base de descarga para visitantes sin cuenta (enlace público), p. ej.
   * "/api/share/TOKEN/download/". Por defecto, la descarga con sesión.
   */
  downloadBase?: string;
  /** Tienda de impresiones de la galería (si el fotógrafo la activó). */
  store?: StoreConfig | null;
}) {
  const palette = PALETTES[design.palette];
  const [open, setOpen] = useState<number | null>(null);
  const hrefFor = (id: string) => (downloadBase ? `${downloadBase}${id}` : defaultDownloadHref(id));

  // Secciones: escenas con fotos y, al final, las fotos sin escena.
  const withMedia = scenes.filter((s) => s.media.length > 0);
  const inScenes = new Set(withMedia.flatMap((s) => s.media.map((m) => m.id)));
  const rest = items.filter((m) => !inScenes.has(m.id));
  const sections: GalleryScene[] =
    withMedia.length > 0
      ? [...withMedia, ...(rest.length > 0 ? [{ id: "mas-fotos", title: "Más fotos", media: rest }] : [])]
      : [{ id: "todas", title: "", media: items }];
  const ordered = sections.flatMap((s) => s.media);

  const cover = ordered.find((m) => m.id === design.coverAssetId) ?? ordered.find((m) => m.kind === "photo") ?? ordered[0];
  const zipPrefix = slugify(title);
  const multi = withMedia.length > 0;
  const entries: ZipEntry[] = sections.flatMap((s, si) =>
    s.media.map((m, i) => ({
      name: `${multi ? `${pad(si + 1)}-${slugify(s.title)}/` : ""}${pad(i + 1, 3)}-${m.file_name}`,
      url: m.url,
      size: m.size_bytes,
      downloadHref: hrefFor(m.id),
    })),
  );
  const ts = titleStyle(design);
  let offset = 0;

  return (
    <div style={{ background: palette.bg, color: palette.text, fontFamily: FONTS.sans.family }}>
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} precedence="default" />
      <Cover design={design} title={title} subtitle={`${authorName} · ${date}`} cover={cover} />

      {/* Barra con escenas y descarga */}
      <div id="galeria" className="sticky top-0 z-20 border-b backdrop-blur" style={{ background: `${palette.bg}f2`, borderColor: palette.accent }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="min-w-0">
            <p className="truncate text-lg" style={ts}>
              {title}
            </p>
            <p className="text-xs" style={{ color: palette.muted }}>
              {ordered.length} {ordered.length === 1 ? "archivo" : "archivos"} · {authorName}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {store ? (
            <CartButton
              store={store}
              className="btn shrink-0 rounded-none border border-current px-3 py-2 text-[11px] uppercase tracking-widest"
            />
          ) : null}
          <SaveToPhotosButton
            media={ordered}
            label="Guardar en Fotos"
            className="btn rounded-none border border-current px-3 py-2 text-[11px] uppercase tracking-widest"
          />
          <DownloadAllButton
            entries={entries}
            zipName={`${zipPrefix}.zip`}
            label="↓ Descargar todo"
            className="btn shrink-0 rounded-none px-3 py-2 text-[11px] uppercase tracking-widest sm:px-4 sm:text-xs"
            style={{ background: palette.text, color: palette.bg }}
          />
          </div>
        </div>
        {multi ? (
          <nav className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 pb-2 text-sm sm:px-8" aria-label="Escenas">
            {sections.map((s) => (
              <a key={s.id} href={`#escena-${s.id}`} className="shrink-0 whitespace-nowrap py-1 hover:underline" style={{ fontFamily: FONTS[design.font].family }}>
                {s.title}
              </a>
            ))}
          </nav>
        ) : null}
      </div>

      <section className="mx-auto max-w-7xl px-2 py-6 sm:px-8 sm:py-10">
        {ordered.length === 0 ? (
          <p className="py-16 text-center text-sm" style={{ color: palette.muted }}>
            Esta galería todavía no tiene fotos.
          </p>
        ) : (
          sections.map((s, si) => {
            const start = offset;
            offset += s.media.length;
            return (
              <div key={s.id} id={`escena-${s.id}`} className={`scroll-mt-28 ${si > 0 ? "mt-16 sm:mt-24" : ""}`}>
                {s.title ? (
                  <h2 className="mb-6 text-center text-xl sm:mb-10 sm:text-2xl" style={ts}>
                    {s.title}
                  </h2>
                ) : null}
                <Masonry items={s.media} offset={start} design={design} onOpen={setOpen} hrefFor={hrefFor} />
              </div>
            );
          })
        )}
      </section>

      <footer className="py-12 text-center text-xs uppercase tracking-[0.3em]" style={{ color: palette.muted }}>
        {authorName}
      </footer>

      {open !== null ? <Lightbox items={ordered} index={open} onClose={() => setOpen(null)} onNavigate={setOpen} hrefFor={hrefFor} store={store} /> : null}
    </div>
  );
}
