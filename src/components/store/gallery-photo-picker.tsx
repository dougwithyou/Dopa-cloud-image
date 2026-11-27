"use client";

import type { FeedMedia } from "@/components/feed-post";
import { useI18n } from "@/i18n/client";

export type PhotoPixels = Record<string, { w: number; h: number }>;

/**
 * Cuadrícula para elegir fotos de la galería (las que ya están en línea, no
 * las del teléfono). Marca las que pueden verse borrosas en el tamaño elegido.
 */
export function GalleryPhotoPicker({
  photos,
  selected,
  onChange,
  max,
  warnIds,
  onPixels,
}: {
  photos: FeedMedia[];
  selected: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  /** Fotos a marcar con aviso (p. ej. baja resolución). */
  warnIds?: Set<string>;
  /** Informa el tamaño real en píxeles de cada foto al cargarla. */
  onPixels?: (id: string, px: { w: number; h: number }) => void;
}) {
  const s = useI18n().t.store;
  const set = new Set(selected);
  const limit = max ?? photos.length;
  const allIds = photos.slice(0, limit).map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => set.has(id));

  const toggle = (id: string) => {
    if (set.has(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < limit) onChange([...selected, id]);
  };

  if (photos.length === 0) {
    return <p className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-500">{s.noPrintable}</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-neutral-600">
          {s.pickedOf(selected.length, Math.min(photos.length, limit))}
          {max && photos.length > max ? s.maxN(max) : ""}
        </span>
        <button type="button" onClick={() => onChange(allSelected ? [] : allIds)} className="text-sm font-medium underline">
          {allSelected ? s.clearAll : s.selectAll}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
        {photos.map((p, i) => {
          const on = set.has(p.id);
          const order = on ? selected.indexOf(p.id) + 1 : null;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              aria-label={s.pickName(on, p.file_name)}
              className={`relative aspect-square overflow-hidden rounded-lg bg-neutral-100 ring-offset-2 transition ${on ? "ring-2 ring-neutral-900" : ""}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 */}
              <img
                src={p.url}
                alt=""
                loading={i < 18 ? "eager" : "lazy"}
                decoding="async"
                onLoad={(e) => onPixels?.(p.id, { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className={`h-full w-full object-cover transition ${on ? "opacity-90" : ""}`}
              />
              <span
                className={`absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${
                  on ? "border-white bg-neutral-900 text-white" : "border-white/90 bg-black/20"
                }`}
              >
                {order ?? ""}
              </span>
              {on && warnIds?.has(p.id) ? (
                <span className="absolute inset-x-1 bottom-1 rounded bg-amber-100/95 px-1 py-0.5 text-[10px] leading-tight text-amber-900">
                  {s.mayBlur}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
