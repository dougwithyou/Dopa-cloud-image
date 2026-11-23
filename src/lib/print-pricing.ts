// Cálculo de precios de la tienda de impresiones. Funciones puras, en
// centavos de USD, sin dependencias (se prueban con node --test).
//
//   precio al cliente = costo del laboratorio × (1 + margen %), redondeado a .99
//   ganancia del fotógrafo = (precio − costo) − comisión de la plataforma
//                            − comisión del procesador de pagos (Stripe)
// El envío se cobra al costo (lo paga el cliente y se le paga al laboratorio).

export const MIN_MARKUP_PERCENT = 20;
export const MAX_MARKUP_PERCENT = 1000;

/** Precio de venta por unidad a partir del costo y el margen. */
export function retailPriceCents(costCents: number, markupPercent: number): number {
  if (!Number.isInteger(costCents) || costCents <= 0) throw new Error("Costo inválido");
  const markup = clampMarkup(markupPercent);
  const raw = Math.ceil((costCents * (100 + markup)) / 100);
  // Precio "redondo": el siguiente dólar menos un centavo ($8.99, $24.99…).
  const charm = Math.ceil((raw + 1) / 100) * 100 - 1;
  // Nunca por debajo del margen mínimo.
  const floor = Math.ceil((costCents * (100 + MIN_MARKUP_PERCENT)) / 100);
  return Math.max(charm, floor);
}

export function clampMarkup(markupPercent: number): number {
  if (!Number.isFinite(markupPercent)) return 100;
  return Math.min(MAX_MARKUP_PERCENT, Math.max(MIN_MARKUP_PERCENT, Math.round(markupPercent)));
}

/**
 * Envío por pedido del laboratorio (WHCC, envío económico a EE.UU. continental):
 * $7.95 por grupo de envío, $9.95 en temporada alta (noviembre a mediados de
 * enero). Cada categoría de producto se produce y envía por separado.
 */
export function shippingCentsFor(shipmentGroups: number, date: Date = new Date()): number {
  if (shipmentGroups <= 0) return 0;
  const month = date.getUTCMonth(); // 0 = enero
  const day = date.getUTCDate();
  const seasonal = month === 10 || month === 11 || (month === 0 && day <= 20);
  return shipmentGroups * (seasonal ? 995 : 795);
}

export interface PricedLine {
  unitPriceCents: number;
  unitCostCents: number;
  quantity: number;
}

export interface OrderQuote {
  subtotalCents: number;
  labProductCostCents: number;
  markupCents: number;
  shippingCents: number;
}

export function quoteOrder(lines: PricedLine[], shippingCents: number): OrderQuote {
  let subtotal = 0;
  let cost = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Cantidad inválida");
    subtotal += l.unitPriceCents * l.quantity;
    cost += l.unitCostCents * l.quantity;
  }
  return { subtotalCents: subtotal, labProductCostCents: cost, markupCents: subtotal - cost, shippingCents };
}

export interface Settlement {
  platformFeeCents: number;
  creatorEarningsCents: number;
}

/**
 * Reparto del margen: la plataforma se queda su porcentaje y el procesador de
 * pagos su comisión; el resto es para el fotógrafo (nunca negativo).
 */
export function settle(markupCents: number, platformFeePercent: number, processingFeeCents: number): Settlement {
  const platformFee = Math.round((Math.max(0, markupCents) * platformFeePercent) / 100);
  const earnings = Math.max(0, markupCents - platformFee - Math.max(0, processingFeeCents));
  return { platformFeeCents: platformFee, creatorEarningsCents: earnings };
}

/** Comisión estimada de Stripe (2.9 % + 30¢) para mostrar en la lista de precios. */
export function estimateProcessingFeeCents(totalCents: number): number {
  return Math.round(totalCents * 0.029) + 30;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
