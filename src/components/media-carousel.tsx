"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";

export interface CarouselMedia {
  id: string;
  kind: "photo" | "video";
  file_name: string;
  url: string;
}

/**
 * Carrusel deslizable (scroll-snap) con contador, flechas y puntos, como en
 * Instagram. Funciona con el dedo en el teléfono y con flechas en la computadora.
 */
export function MediaCarousel({
  media,
  fit = "aspect",
  onIndexChange,
  eager = false,
  dark = false,
}: {
  media: CarouselMedia[];
  /** "aspect": proporción 4:5 fija (feed) · "fill": ocupa todo el alto disponible (modal). */
  fit?: "aspect" | "fill";
  onIndexChange?: (index: number) => void;
  eager?: boolean;
  dark?: boolean;
}) {
  const [current, setCurrent] = useState(0);
  const g = useI18n().t.gallery;
  const track = useRef<HTMLDivElement>(null);
  const count = media.length;
  const many = count > 1;

  useEffect(() => {
    onIndexChange?.(current);
  }, [current, onIndexChange]);

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const sizing = fit === "fill" ? "h-full w-full object-contain" : "aspect-[4/5] w-full object-contain";

  return (
    <div className={`relative ${fit === "fill" ? "h-full" : ""} ${dark ? "bg-black" : "bg-neutral-100"}`}>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== current) setCurrent(i);
        }}
        className={`flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          fit === "fill" ? "h-full" : ""
        }`}
      >
        {media.map((m, i) => (
          <div key={m.id} className={`flex w-full shrink-0 snap-center items-center justify-center ${fit === "fill" ? "h-full" : ""}`}>
            {m.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2
              <img src={m.url} alt={m.file_name} loading={eager && i === 0 ? "eager" : "lazy"} className={`block ${sizing}`} />
            ) : (
              <video src={m.url} controls playsInline preload="metadata" className={`block bg-black ${sizing}`} />
            )}
          </div>
        ))}
      </div>

      {many ? (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            {current + 1}/{count}
          </span>
          {current > 0 ? (
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              aria-label={g.previous}
              className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow sm:flex"
            >
              ‹
            </button>
          ) : null}
          {current < count - 1 ? (
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              aria-label={g.next}
              className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg shadow sm:flex"
            >
              ›
            </button>
          ) : null}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1" aria-hidden>
            {media.map((m, i) => (
              <span key={m.id} className={`h-1.5 w-1.5 rounded-full ${i === current ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
