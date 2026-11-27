import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

/** Idioma de la petición: el elegido a mano (cookie) o el del dispositivo. */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: getMessages(locale) };
}
