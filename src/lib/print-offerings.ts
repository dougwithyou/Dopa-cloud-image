// Catálogo curado de la tienda: solo lo que se vende, con nombres en español.
// Sin dependencias (lo usan el servidor, el navegador y las pruebas).

export type OfferingKind = "print" | "canvas" | "book" | "card";

export interface Offering {
  /** `ref` del producto en WHCC. */
  ref: string;
  kind: OfferingKind;
  label: string;
  /** "api": se arma con una foto. "editor": el cliente lo diseña en el editor de WHCC. */
  completion: "api" | "editor";
  /** Tamaños que se ofrecen (solo productos de una foto). */
  sizes?: string[];
  /** Opciones fijas que se envían al laboratorio. */
  selections?: Record<string, string>;
  description: string;
}

export const OFFERINGS: Offering[] = [
  {
    ref: "photo-print",
    kind: "print",
    label: "Impresión fotográfica",
    completion: "api",
    sizes: ["4x6", "5x7", "8x10", "11x14", "16x20", "20x30"],
    selections: { surface: "lustre" },
    description: "Papel fotográfico profesional, acabado lustre.",
  },
  {
    ref: "gallery-wrap",
    kind: "canvas",
    label: "Canvas",
    completion: "api",
    sizes: ["8x10", "11x14", "16x20", "20x30", "24x36"],
    description: "Lienzo montado en bastidor de madera, listo para colgar.",
  },
  { ref: "hardcover-book", kind: "book", label: "Photobook tapa dura", completion: "editor", description: "Tapa dura, páginas de papel mate." },
  { ref: "softcover-book", kind: "book", label: "Photobook tapa blanda", completion: "editor", description: "Tapa blanda con foto, el más ligero." },
  { ref: "layflat-book", kind: "book", label: "Photobook layflat", completion: "editor", description: "Páginas que abren totalmente planas." },
  { ref: "5x7-horizontal-flat-card", kind: "card", label: "Tarjeta plana horizontal", completion: "editor", description: "5×7 pulgadas, con sobre." },
  { ref: "5x7-vertical-flat-card", kind: "card", label: "Tarjeta plana vertical", completion: "editor", description: "5×7 pulgadas, con sobre." },
  { ref: "5x7-horizontal-folded-card", kind: "card", label: "Tarjeta doblada horizontal", completion: "editor", description: "5×7 pulgadas doblada, con sobre." },
  { ref: "5x7-vertical-folded-card", kind: "card", label: "Tarjeta doblada vertical", completion: "editor", description: "5×7 pulgadas doblada, con sobre." },
];

export const KIND_LABEL: Record<OfferingKind, string> = {
  print: "Impresiones",
  canvas: "Canvas",
  book: "Photobooks",
  card: "Tarjetas",
};

export const KIND_ORDER: OfferingKind[] = ["print", "canvas", "book", "card"];

/** Ocasiones de las tarjetas (etiquetas de diseños de WHCC). */
export const CARD_OCCASIONS: { tag: string; label: string }[] = [
  { tag: "holiday", label: "Fiestas" },
  { tag: "wedding", label: "Bodas" },
  { tag: "graduation", label: "Graduación" },
  { tag: "baby", label: "Bebé" },
  { tag: "birthday", label: "Cumpleaños" },
];

export const CARD_REFS = OFFERINGS.filter((o) => o.kind === "card").map((o) => o.ref);

export function offeringFor(ref: string): Offering | undefined {
  return OFFERINGS.find((o) => o.ref === ref);
}

/** Cantidad válida: al menos el mínimo y en pasos del producto (25, 30, 35…). */
export function normalizeQuantity(quantity: number, min: number, step: number): number {
  const q = Math.max(min, Math.round(Number.isFinite(quantity) ? quantity : min));
  const s = Math.max(1, step);
  return min + Math.ceil((q - min) / s) * s;
}
