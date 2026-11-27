"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Textos del idioma actual en componentes del navegador. */
export function useI18n() {
  const locale = useContext(LocaleContext);
  return { locale, t: getMessages(locale) };
}
