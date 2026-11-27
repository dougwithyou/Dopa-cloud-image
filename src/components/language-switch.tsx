"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { useI18n } from "@/i18n/client";

/** Selector de idioma "EN · ES". */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={`inline-flex items-center gap-1 text-xs font-semibold tracking-wide ${pending ? "opacity-60" : ""} ${className}`} role="group" aria-label="Language / Idioma">
      {LOCALES.map((l, i) => (
        <span key={l} className="inline-flex items-center gap-1">
          {i > 0 ? <span className="opacity-40">·</span> : null}
          <button
            type="button"
            lang={l}
            aria-pressed={l === locale}
            disabled={pending || l === locale}
            onClick={() => start(async () => {
              await setLocale(l);
              router.refresh();
            })}
            className={`rounded px-1 py-0.5 uppercase ${l === locale ? "" : "opacity-50 hover:opacity-100"}`}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  );
}
