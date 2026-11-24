// Tipos y reglas de la tienda compartidos entre servidor y navegador (sin
// costos mayoristas: eso nunca sale del servidor).

export interface StoreProduct {
  id: string;
  productRef: string;
  productName: string;
  categoryRef: string;
  categoryName: string;
  sizeLabel: string;
  widthIn: number | null;
  heightIn: number | null;
  priceCents: number;
  /** PPI que recomienda el laboratorio para este producto. */
  resolution: number | null;
  description: string | null;
  kind: "print" | "canvas" | "book" | "card";
  /** "api": se arma con una foto. "editor": se diseña en el editor de WHCC. */
  completion: "api" | "editor";
  minQuantity: number;
  quantityStep: number;
}

export interface StoreConfig {
  projectId: string;
  products: StoreProduct[];
  /** Envío por grupo (categoría) en este momento. */
  shippingPerGroupCents: number;
  /** Página del carrito y pago. */
  cartHref: string;
}

/**
 * Línea del carrito: una foto impresa (assetId) o un diseño del editor de WHCC
 * (editorItemId: photobook o tarjetas). El precio se recalcula en el servidor.
 */
export interface CartLine {
  productId: string;
  quantity: number;
  assetId?: string;
  fileName?: string;
  editorItemId?: string;
  previewUrl?: string | null;
  /** Solo para mostrar (diseños: depende de las páginas). */
  unitPriceCents?: number;
}

export function lineKey(l: Pick<CartLine, "productId" | "assetId" | "editorItemId">): string {
  return l.editorItemId ? `e:${l.editorItemId}` : `p:${l.productId}:${l.assetId}`;
}

/** Formatos y tamaño máximo que acepta el laboratorio. */
export const PRINTABLE_EXTENSIONS = ["jpg", "jpeg", "png", "heic", "heif"];
export const MAX_PRINT_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 100;

export function isPrintable(file: { kind: string; file_name: string; size_bytes: number }): boolean {
  const ext = file.file_name.toLowerCase().split(".").pop() ?? "";
  return file.kind === "photo" && PRINTABLE_EXTENSIONS.includes(ext) && file.size_bytes <= MAX_PRINT_FILE_BYTES;
}

/** Estados contiguos de EE.UU. y DC (Alaska y Hawái solo admiten envío exprés). */
export const US_STATES: [string, string][] = [
  ["AL", "Alabama"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pago pendiente",
  paid: "Pagado",
  submitting: "Enviando al laboratorio",
  in_production: "En producción",
  shipped: "Enviado",
  canceled: "Cancelado",
  refunded: "Reembolsado",
  failed: "Con problemas",
};
