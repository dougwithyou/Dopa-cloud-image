"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PhotoGalleryTemplate, type GalleryScene } from "@/components/templates/photo-gallery";
import type { FeedMedia } from "@/components/feed-post";
import { ArrowLeftIcon, EyeIcon } from "@/components/icons";
import {
  COVERS,
  FONTS,
  GOOGLE_FONTS_HREF,
  PALETTES,
  STYLES,
  STYLE_PRESETS,
  type CoverId,
  type GalleryDesign,
  type PaletteId,
  type StyleId,
} from "@/lib/gallery-design";
import { saveGalleryDesign } from "@/app/dashboard/actions";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-neutral-700">{title}</h3>
      {children}
    </section>
  );
}

/** Miniatura esquemática de cada tipo de portada. */
function CoverSketch({ cover }: { cover: CoverId }) {
  const photo = "bg-neutral-400";
  if (cover === "split") {
    return (
      <span className="grid h-full w-full grid-cols-2">
        <span className="flex flex-col justify-center gap-1 bg-neutral-50 p-1.5">
          <span className="h-1.5 w-8 bg-neutral-700" />
          <span className="h-1 w-6 bg-neutral-300" />
        </span>
        <span className={photo} />
      </span>
    );
  }
  if (cover === "frame") {
    return (
      <span className="flex h-full w-full flex-col items-center gap-1 bg-neutral-50 p-1.5">
        <span className="h-1.5 w-10 bg-neutral-700" />
        <span className={`w-full flex-1 ${photo} ring-2 ring-white ring-offset-1 ring-offset-neutral-200`} />
      </span>
    );
  }
  return (
    <span className={`flex h-full w-full items-center justify-center ${photo}`}>
      <span className="h-1.5 w-10 bg-white" />
    </span>
  );
}

/**
 * Editor del diseño de la galería: vista previa en vivo a la izquierda y
 * panel de estilo, color, tipografía, portada y cuadrícula a la derecha.
 */
export function GalleryEditor({
  projectId,
  title,
  authorName,
  date,
  items,
  scenes,
  initialDesign,
}: {
  projectId: string;
  title: string;
  authorName: string;
  date: string;
  items: FeedMedia[];
  scenes: GalleryScene[];
  initialDesign: GalleryDesign;
}) {
  const [design, setDesign] = useState(initialDesign);
  const [saved, setSaved] = useState(initialDesign);
  const [notice, setNotice] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(design) !== JSON.stringify(saved);
  const photos = items.filter((m) => m.kind === "photo");

  const set = <K extends keyof GalleryDesign>(key: K, value: GalleryDesign[K]) => {
    setNotice(null);
    setDesign((d) => ({ ...d, [key]: value }));
  };

  const applyStyle = (style: StyleId) => {
    setNotice(null);
    setDesign((d) => ({ ...STYLE_PRESETS[style], coverAssetId: d.coverAssetId }));
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveGalleryDesign({ projectId, design });
      setNotice(result);
      if (!result?.error) setSaved(design);
    });

  return (
    <div className="flex h-dvh flex-col bg-neutral-100">
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} precedence="default" />
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Volver al proyecto
        </Link>
        <p className="hidden truncate text-sm font-semibold sm:block">Diseño de la galería · {title}</p>
        <div className="flex items-center gap-2">
          <Link href={`/preview/${projectId}`} target="_blank" className="btn-ghost px-2.5 py-1.5">
            <EyeIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Vista previa</span>
          </Link>
          <button type="button" className="btn-primary px-4 py-1.5" disabled={!dirty || pending} onClick={save}>
            {pending ? "Guardando…" : dirty ? "Guardar" : "Guardado"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        {/* Vista previa en vivo */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:p-4">
          <div className="overflow-hidden bg-white lg:rounded-xl lg:shadow-sm">
            <PhotoGalleryTemplate
              title={title}
              authorName={authorName}
              date={date}
              items={items}
              scenes={scenes}
              design={design}
            />
          </div>
        </div>

        {/* Panel de diseño */}
        <aside className="max-h-[45vh] shrink-0 space-y-3 overflow-y-auto border-b border-neutral-200 bg-neutral-100 p-4 lg:max-h-none lg:w-80 lg:border-b-0 lg:border-l">
          {notice?.error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{notice.error}</p> : null}
          {notice?.message && !dirty ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{notice.message}</p>
          ) : null}

          <Panel title="Estilo">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(STYLES) as StyleId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyStyle(id)}
                  title={STYLES[id].help}
                  className={`rounded-md border px-2 py-1.5 text-xs transition ${
                    design.style === id ? "border-neutral-900 font-semibold" : "border-transparent text-neutral-600 hover:border-neutral-300"
                  }`}
                >
                  {STYLES[id].label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              {(Object.keys(PALETTES) as PaletteId[]).map((id) => {
                const p = PALETTES[id];
                const active = design.palette === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set("palette", id)}
                    title={p.label}
                    aria-label={`Paleta ${p.label}`}
                    className={`h-9 w-9 overflow-hidden rounded-full transition ${
                      active ? "ring-2 ring-neutral-900 ring-offset-2" : "ring-1 ring-neutral-300 hover:ring-neutral-500"
                    }`}
                  >
                    {/* Arriba: color del texto · abajo: fondo de la galería */}
                    <span className="block h-1/2" style={{ background: p.text }} />
                    <span className="block h-1/2" style={{ background: p.bg }} />
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Tipografía">
            <div className="grid grid-cols-2 gap-2">
              {(["sans", "serif"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set("font", id)}
                  className={`rounded-lg border py-3 text-2xl transition ${
                    design.font === id ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-400"
                  }`}
                  style={{ fontFamily: FONTS[id].family }}
                >
                  Aa
                  <span className="block font-sans text-[10px] text-neutral-500">{FONTS[id].label}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Portada">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(COVERS) as CoverId[]).map((id) => (
                <button key={id} type="button" onClick={() => set("cover", id)} className="text-left">
                  <span
                    className={`block aspect-[4/3] overflow-hidden rounded-md border transition ${
                      design.cover === id ? "border-neutral-900 ring-2 ring-neutral-900/20" : "border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    <CoverSketch cover={id} />
                  </span>
                  <span className="mt-1 block text-[11px] text-neutral-600">{COVERS[id].label}</span>
                </button>
              ))}
            </div>
            {photos.length > 0 ? (
              <>
                <p className="mb-2 mt-4 text-xs text-neutral-500">Foto de portada</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {photos.slice(0, 60).map((m, i) => {
                    const active = design.coverAssetId ? design.coverAssetId === m.id : i === 0;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => set("coverAssetId", m.id)}
                        className={`h-14 w-14 shrink-0 overflow-hidden rounded ${active ? "ring-2 ring-neutral-900 ring-offset-1" : "opacity-80 hover:opacity-100"}`}
                        title={m.file_name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 */}
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </Panel>

          <Panel title="Cuadrícula">
            <label className="block text-xs text-neutral-600">
              <span className="flex justify-between">
                <span>Fotos pequeñas</span>
                <span>Fotos grandes</span>
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={design.size}
                onChange={(e) => set("size", Number(e.target.value))}
                className="mt-1 w-full accent-neutral-900"
              />
            </label>
            <label className="mt-3 block text-xs text-neutral-600">
              <span className="flex justify-between">
                <span>Espacio estrecho</span>
                <span>Espacio amplio</span>
              </span>
              <input
                type="range"
                min={0}
                max={4}
                step={1}
                value={design.spacing}
                onChange={(e) => set("spacing", Number(e.target.value))}
                className="mt-1 w-full accent-neutral-900"
              />
            </label>
          </Panel>

          <Panel title="Escenas">
            <p className="text-xs leading-relaxed text-neutral-600">
              {scenes.length > 0
                ? `Tienes ${scenes.length} escena(s). Las fotos sin escena aparecen al final como “Más fotos”.`
                : "Organiza la galería en secciones (p. ej. Ceremonia, Recepción)."}{" "}
              Créalas en el proyecto: selecciona fotos en el material y pulsa “Crear escena”.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
