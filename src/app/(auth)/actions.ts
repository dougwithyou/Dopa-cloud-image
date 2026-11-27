"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/auth";
import { appUrl, safeNextPath } from "@/lib/env";
import { getI18n } from "@/i18n/server";

export type FormState = { error?: string; message?: string } | null;

async function schemas() {
  const { t } = await getI18n();
  const e = t.auth.errors;
  return {
    e,
    Email: z.email(e.invalidEmail).transform((v) => v.trim().toLowerCase()),
    Password: z.string().min(8, e.shortPassword).max(72),
  };
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const { e, Email } = await schemas();
  const parsed = z
    .object({ email: Email, password: z.string().min(1, e.enterPassword) })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: e.wrongCredentials };

  const next = formData.get("next");
  const target = typeof next === "string" && next ? safeNextPath(next) : await homePathFor(supabase, data.user);
  redirect(target);
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const { e, Email, Password } = await schemas();
  const parsed = z
    .object({ email: Email, password: Password })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: appUrl("/auth/confirm?next=/onboarding") },
  });
  if (error) return { error: error.message };

  // Con confirmación de email desactivada, Supabase devuelve sesión inmediata.
  if (data.session) redirect("/onboarding");
  return { message: e.confirmEmail };
}

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { e, Email } = await schemas();
  const parsed = Email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: e.invalidEmail };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: appUrl("/auth/confirm?next=/reset-password"),
  });
  // Mismo mensaje exista o no la cuenta (no revelar qué correos están registrados).
  return { message: e.resetSent };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { e, Password } = await schemas();
  const parsed = z
    .object({ password: Password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: e.mismatch })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error || !data.user) return { error: e.linkExpired };
  redirect(await homePathFor(supabase, data.user));
}
