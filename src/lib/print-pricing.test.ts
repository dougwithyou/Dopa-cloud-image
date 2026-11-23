// npm run test:pricing
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampMarkup, quoteOrder, retailPriceCents, settle, shippingCentsFor } from "./print-pricing.ts";

test("precio con margen y redondeo a .99", () => {
  assert.equal(retailPriceCents(450, 100), 999); // 9.00 → 9.99
  assert.equal(retailPriceCents(450, 50), 699); // 6.75 → 6.99
  assert.equal(retailPriceCents(2900, 100), 5899); // 58.00 → 58.99
  assert.equal(retailPriceCents(7645, 30), 9999); // 99.39 → 99.99
});

test("el precio nunca baja del margen mínimo", () => {
  for (const cost of [1, 99, 100, 101, 450, 12345]) {
    for (const m of [0, 5, 20, 37, 100, 999]) {
      const price = retailPriceCents(cost, m);
      assert.ok(price >= Math.ceil(cost * 1.2), `costo ${cost} margen ${m} → ${price}`);
      assert.ok(price >= Math.ceil((cost * (100 + clampMarkup(m))) / 100), "respeta el margen pedido");
    }
  }
});

test("si sube el costo, sube el precio y se mantiene el margen", () => {
  assert.ok(retailPriceCents(260, 50) >= retailPriceCents(240, 50));
  assert.ok(retailPriceCents(3200, 50) > retailPriceCents(2900, 50));
});

test("margen fuera de rango se ajusta", () => {
  assert.equal(clampMarkup(5), 20);
  assert.equal(clampMarkup(5000), 1000);
  assert.equal(clampMarkup(Number.NaN), 100);
});

test("costo inválido lanza error", () => {
  assert.throws(() => retailPriceCents(0, 100));
  assert.throws(() => retailPriceCents(1.5, 100));
});

test("envío por grupo y temporada", () => {
  assert.equal(shippingCentsFor(1, new Date("2026-06-10T12:00:00Z")), 795);
  assert.equal(shippingCentsFor(2, new Date("2026-06-10T12:00:00Z")), 1590);
  assert.equal(shippingCentsFor(1, new Date("2026-11-23T12:00:00Z")), 995);
  assert.equal(shippingCentsFor(1, new Date("2027-01-10T12:00:00Z")), 995);
  assert.equal(shippingCentsFor(1, new Date("2027-01-25T12:00:00Z")), 795);
  assert.equal(shippingCentsFor(0), 0);
});

test("cotización del pedido", () => {
  const q = quoteOrder(
    [
      { unitPriceCents: 999, unitCostCents: 450, quantity: 2 },
      { unitPriceCents: 5899, unitCostCents: 2900, quantity: 1 },
    ],
    795,
  );
  assert.deepEqual(q, { subtotalCents: 7897, labProductCostCents: 3800, markupCents: 4097, shippingCents: 795 });
  assert.throws(() => quoteOrder([{ unitPriceCents: 1, unitCostCents: 1, quantity: 0 }], 0));
});

test("reparto: comisión de plataforma y de Stripe", () => {
  assert.deepEqual(settle(4097, 15, 280), { platformFeeCents: 615, creatorEarningsCents: 3202 });
  assert.deepEqual(settle(4097, 0, 280), { platformFeeCents: 0, creatorEarningsCents: 3817 });
  // Nunca negativo
  assert.deepEqual(settle(100, 15, 500), { platformFeeCents: 15, creatorEarningsCents: 0 });
});
