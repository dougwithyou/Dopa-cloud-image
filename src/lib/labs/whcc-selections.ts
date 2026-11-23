// Arma el objeto `selections` completo de un producto de WHCC a partir de su
// configuración del catálogo, siguiendo las reglas de su documentación:
//  * Se envía cada campo del producto: lo elegido, o su `default`, o el primer
//    valor habilitado.
//  * Un campo "pertenece" a una superficie o material cuando su nombre es el id
//    de un valor de otro campo (p. ej. el campo `photo_print` aplica solo si
//    `surface` = "photo_print"). Los que no aplican se omiten.
//  * `orientation` se omite (WHCC la deduce de la imagen) y los campos de
//    medida personalizada (`dimension`) también.
// Sin dependencias: se prueba con node --test.

export interface WhccFieldValue {
  id: string;
  name?: string;
  enabled?: boolean;
  width?: number;
  height?: number;
}

export interface WhccField {
  field: string;
  name?: string;
  required?: boolean;
  kind: string;
  values?: WhccFieldValue[];
  default?: string;
}

export type Selections = Record<string, string | number>;

export function resolveSelections(fields: WhccField[], chosen: Record<string, string>): Selections | null {
  // A qué valor de qué campo pertenece cada campo.
  const parentOf = new Map<string, { field: string; value: string }>();
  for (const f of fields) {
    for (const v of f.values ?? []) {
      if (fields.some((g) => g.field === v.id && g.field !== f.field)) parentOf.set(v.id, { field: f.field, value: v.id });
    }
  }

  const picked: Record<string, string> = {};
  for (const f of fields) {
    if (f.field === "orientation" || f.field === "quantity" || f.kind === "dimension" || f.field === "dimensions") continue;
    if (f.kind !== "enum") {
      // Un campo obligatorio que no sabemos llenar: no se ofrece el producto.
      if (f.required) return null;
      continue;
    }
    const enabled = (f.values ?? []).filter((v) => v.enabled !== false);
    if (enabled.length === 0) {
      if (f.required) return null;
      continue;
    }
    const wanted = chosen[f.field];
    if (wanted !== undefined) {
      if (!enabled.some((v) => v.id === wanted)) return null;
      picked[f.field] = wanted;
    } else if (f.default && enabled.some((v) => v.id === f.default)) {
      picked[f.field] = f.default;
    } else {
      picked[f.field] = enabled[0].id;
    }
  }

  // Quita los campos cuya superficie o material no se eligió (en cadena).
  const applies = (field: string, seen = new Set<string>()): boolean => {
    const parent = parentOf.get(field);
    if (!parent) return true;
    if (seen.has(field)) return false;
    seen.add(field);
    return picked[parent.field] === parent.value && applies(parent.field, seen);
  };

  const result: Selections = {};
  for (const [field, value] of Object.entries(picked)) {
    if (applies(field)) result[field] = value;
  }
  result.quantity = 1;
  return result;
}

/** El campo que define el tamaño y sus valores habilitados con medidas. */
export function sizeOptions(fields: WhccField[], sizedBy: string[] | undefined): { field: string; values: WhccFieldValue[] } | null {
  const name = sizedBy?.[0];
  if (!name) return null;
  const f = fields.find((x) => x.field === name && x.kind === "enum");
  if (!f) return null;
  const values = (f.values ?? []).filter((v) => v.enabled !== false && v.id !== "custom");
  return values.length > 0 ? { field: f.field, values } : null;
}
