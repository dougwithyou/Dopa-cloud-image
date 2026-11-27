// Tipado de los diccionarios: el español es la fuente y el inglés debe tener
// exactamente la misma forma (mismas claves, mismas funciones). Si falta una
// traducción, TypeScript no compila.

type Fn = (...args: never[]) => string;

export type Shape<T> = T extends Fn
  ? T
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? readonly Shape<U>[]
      : { [K in keyof T]: Shape<T[K]> };

export function defineMessages<T>(es: T, en: Shape<T>): { es: T; en: T } {
  return { es, en: en as unknown as T };
}
