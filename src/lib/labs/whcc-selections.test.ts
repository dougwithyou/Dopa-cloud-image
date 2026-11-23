import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSelections, sizeOptions, type WhccField } from "./whcc-selections.ts";

// Configuración recortada del "Framed Print" de la documentación de WHCC.
const framed: WhccField[] = [
  {
    field: "size",
    required: true,
    kind: "enum",
    values: [
      { id: "5x7", enabled: true, width: 5, height: 7 },
      { id: "8x10", enabled: true, width: 8, height: 10 },
      { id: "40x60", enabled: false, width: 40, height: 60 },
    ],
    default: "8x10",
  },
  {
    field: "surface",
    required: true,
    kind: "enum",
    values: [
      { id: "photo_print", enabled: true },
      { id: "fine_art_canvas", enabled: true },
      { id: "metal_print", enabled: true },
    ],
    default: "photo_print",
  },
  {
    field: "photo_print",
    required: false,
    kind: "enum",
    values: [
      { id: "lustre_photo_print", enabled: true },
      { id: "fuji_deep_matte_photo_print", enabled: true },
    ],
    default: "lustre_photo_print",
  },
  { field: "metal_print", required: false, kind: "enum", values: [{ id: "glossy_metal", enabled: true }] },
  { field: "mat", required: false, kind: "enum", values: [{ id: "no", enabled: true }, { id: "yes", enabled: true }], default: "no" },
  { field: "orientation", required: false, kind: "enum", values: [{ id: "portrait", enabled: true }] },
  { field: "moulding", required: false, kind: "enum", values: [{ id: "woodland_walnut", enabled: true }] },
];

test("usa lo elegido, los defaults y el primer valor habilitado", () => {
  const s = resolveSelections(framed, { size: "5x7" });
  assert.deepEqual(s, {
    size: "5x7",
    surface: "photo_print",
    photo_print: "lustre_photo_print",
    mat: "no",
    moulding: "woodland_walnut",
    quantity: 1,
  });
});

test("omite los campos de superficies no elegidas y la orientación", () => {
  const s = resolveSelections(framed, { size: "8x10", surface: "metal_print" });
  assert.equal(s?.metal_print, "glossy_metal");
  assert.equal(s?.photo_print, undefined);
  assert.equal(s?.orientation, undefined);
});

test("un valor deshabilitado o inexistente invalida la combinación", () => {
  assert.equal(resolveSelections(framed, { size: "40x60" }), null);
  assert.equal(resolveSelections(framed, { size: "99x99" }), null);
});

test("un campo obligatorio desconocido deja el producto fuera", () => {
  assert.equal(resolveSelections([...framed, { field: "engraving", kind: "text", required: true }], {}), null);
});

test("tamaños disponibles según sizedBy", () => {
  const opts = sizeOptions(framed, ["size"]);
  assert.deepEqual(opts?.values.map((v) => v.id), ["5x7", "8x10"]);
  assert.equal(sizeOptions(framed, undefined), null);
});
