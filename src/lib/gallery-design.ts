// Diseño de la plantilla "Galería de fotos". Se guarda en projects.design
// (jsonb) y lo usan el editor (vista previa en vivo), el portal y la vista previa.

import { z } from "zod";

export const STYLES = {
  airy: { label: "Airy", help: "Luminosa y aireada" },
  folk: { label: "Folk", help: "Cálida y orgánica" },
  editorial: { label: "Editorial", help: "Elegante, de revista" },
} as const;

export const PALETTES = {
  ivory: { label: "Marfil", bg: "#faf8f4", surface: "#ffffff", text: "#1c1917", muted: "#78716c", accent: "#d6cfc4" },
  white: { label: "Blanco", bg: "#ffffff", surface: "#ffffff", text: "#111111", muted: "#737373", accent: "#bfdbfe" },
  sand: { label: "Arena", bg: "#f2ebe3", surface: "#f8f3ed", text: "#3b2a1f", muted: "#8a7260", accent: "#c8a98d" },
  sage: { label: "Salvia", bg: "#eef0ea", surface: "#f6f7f3", text: "#2c3628", muted: "#6b7563", accent: "#a7b39a" },
  night: { label: "Noche", bg: "#111111", surface: "#1a1a1a", text: "#f5f5f4", muted: "#a3a3a3", accent: "#e7e5e4" },
} as const;

export const FONTS = {
  sans: { label: "Sans", family: "'Jost', ui-sans-serif, system-ui, sans-serif" },
  serif: { label: "Serif", family: "'Cormorant Garamond', ui-serif, Georgia, serif" },
} as const;

export const COVERS = {
  full: { label: "Pantalla completa" },
  split: { label: "Dividida" },
  frame: { label: "Con marco" },
} as const;

/** Google Fonts (cargadas en el navegador, no en el build). */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Jost:wght@300;400;500&display=swap";

export type StyleId = keyof typeof STYLES;
export type PaletteId = keyof typeof PALETTES;
export type FontId = keyof typeof FONTS;
export type CoverId = keyof typeof COVERS;

export interface GalleryDesign {
  style: StyleId;
  palette: PaletteId;
  font: FontId;
  cover: CoverId;
  /** 1 = fotos pequeñas (más columnas) … 5 = fotos grandes (menos columnas). */
  size: number;
  /** 0 = sin espacio … 4 = espacios amplios. */
  spacing: number;
  /** Archivo de portada (si no, la primera foto). */
  coverAssetId: string | null;
}

/** Valores de cada estilo predefinido; el creador puede ajustar después. */
export const STYLE_PRESETS: Record<StyleId, Omit<GalleryDesign, "coverAssetId">> = {
  airy: { style: "airy", palette: "white", font: "sans", cover: "full", size: 3, spacing: 3 },
  folk: { style: "folk", palette: "sand", font: "serif", cover: "frame", size: 3, spacing: 2 },
  editorial: { style: "editorial", palette: "ivory", font: "serif", cover: "split", size: 2, spacing: 2 },
};

export const DEFAULT_DESIGN: GalleryDesign = { ...STYLE_PRESETS.editorial, coverAssetId: null };

const Schema = z.object({
  style: z.enum(Object.keys(STYLES) as [StyleId, ...StyleId[]]),
  palette: z.enum(Object.keys(PALETTES) as [PaletteId, ...PaletteId[]]),
  font: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]),
  cover: z.enum(Object.keys(COVERS) as [CoverId, ...CoverId[]]),
  size: z.number().int().min(1).max(5),
  spacing: z.number().int().min(0).max(4),
  coverAssetId: z.uuid().nullable(),
});

/** Lee el diseño guardado; cualquier valor ausente o inválido usa el predeterminado. */
export function parseDesign(raw: unknown): GalleryDesign {
  const base = { ...DEFAULT_DESIGN };
  if (!raw || typeof raw !== "object") return base;
  const merged = { ...base, ...(raw as Record<string, unknown>) };
  const parsed = Schema.safeParse(merged);
  if (parsed.success) return parsed.data;
  // Conserva los campos válidos uno por uno.
  const out = { ...base };
  for (const key of Object.keys(base) as (keyof GalleryDesign)[]) {
    const single = Schema.shape[key].safeParse(merged[key]);
    if (single.success) (out as Record<string, unknown>)[key] = single.data;
  }
  return out;
}

export function validateDesign(raw: unknown): GalleryDesign | null {
  const parsed = Schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Columnas del mosaico según el tamaño elegido y el ancho de pantalla. */
export function columnsFor(size: number, width: number): number {
  const desktop = [6, 5, 4, 3, 2][size - 1] ?? 4;
  if (width >= 1024) return desktop;
  if (width >= 640) return Math.max(2, desktop - 1);
  return size >= 4 ? 1 : 2;
}

export const GAP_PX = [0, 4, 10, 18, 30];
