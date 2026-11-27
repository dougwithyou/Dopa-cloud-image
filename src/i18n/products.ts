import type { Messages } from "@/i18n/messages";

type Localizable = {
  productRef: string;
  kind: "print" | "canvas" | "book" | "card";
  productName: string;
  categoryName: string;
  description: string | null;
  sizeLabel: string;
};

/** Tamaño con la orientación traducida: "7×5 horizontal" → "7×5 landscape". */
export function localizeSizeLabel(label: string, t: Messages): string {
  return label.replace(/\b(horizontal|vertical|cuadrado)$/, (w) => t.labels.orientation[w] ?? w);
}

/** Nombre, categoría, descripción y tamaño del producto en el idioma de quien mira. */
export function localizeProduct<T extends Localizable>(p: T, t: Messages): T {
  return {
    ...p,
    productName: t.labels.products[p.productRef] ?? p.productName,
    categoryName: t.labels.kind[p.kind] ?? p.categoryName,
    description: t.labels.productDescriptions[p.productRef] ?? p.description,
    sizeLabel: localizeSizeLabel(p.sizeLabel, t),
  };
}
