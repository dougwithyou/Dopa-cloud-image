"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Guarda el idioma elegido a mano (1 año) y, si es un fotógrafo, también en su cuenta. */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  const { user } = await getSession();
  if (user) {
    await createAdminClient().from("creators").update({ locale }).eq("user_id", user.id);
  }
}
