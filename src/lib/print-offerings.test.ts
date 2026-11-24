import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_REFS, OFFERINGS, normalizeQuantity, offeringFor } from "./print-offerings.ts";

test("catálogo curado: solo impresiones, canvas, photobooks y tarjetas", () => {
  assert.deepEqual([...new Set(OFFERINGS.map((o) => o.kind))], ["print", "canvas", "book", "card"]);
  assert.deepEqual(offeringFor("photo-print")?.sizes, ["4x6", "5x7", "8x10", "11x14", "16x20", "20x30"]);
  assert.deepEqual(offeringFor("gallery-wrap")?.sizes, ["8x10", "11x14", "16x20", "20x30", "24x36"]);
  assert.equal(offeringFor("metal-print"), undefined);
  assert.equal(CARD_REFS.length, 4);
  assert.ok(OFFERINGS.filter((o) => o.kind === "book" || o.kind === "card").every((o) => o.completion === "editor"));
});

test("cantidad de tarjetas: mínimo 25 y de 5 en 5", () => {
  assert.equal(normalizeQuantity(1, 25, 5), 25);
  assert.equal(normalizeQuantity(25, 25, 5), 25);
  assert.equal(normalizeQuantity(27, 25, 5), 30);
  assert.equal(normalizeQuantity(30, 25, 5), 30);
  assert.equal(normalizeQuantity(3, 1, 1), 3);
  assert.equal(normalizeQuantity(Number.NaN, 25, 5), 25);
});
