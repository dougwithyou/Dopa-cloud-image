// Idiomas del sitio. Sin dependencias: lo usan el servidor, el navegador y las pruebas.

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie con el idioma elegido a mano (tiene prioridad sobre el del dispositivo). */
export const LOCALE_COOKIE = "hdc_lang";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Idioma según el encabezado Accept-Language del navegador (el idioma del
 * dispositivo). Respeta las prioridades (q): gana el primer español o inglés.
 * Cualquier otro idioma → inglés.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const prefs = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((p) => p.lang && p.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const p of prefs) if (isLocale(p.lang)) return p.lang;
  return DEFAULT_LOCALE;
}

/** Locale de Intl para fechas. */
export function intlLocale(locale: Locale): string {
  return locale === "es" ? "es" : "en-US";
}
