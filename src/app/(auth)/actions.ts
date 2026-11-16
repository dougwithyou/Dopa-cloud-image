"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/auth";
import { appUrl, safeNextPath } from "@/lib/env";

export type FormState = { error?: string; message?: string } | null;

const Email = z.email("Correo inválido").transform((v) => v.trim().toLowerCase());
const Password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72);

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ email: Email, password: z.string().min(1, "Ingresa tu contraseña") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Correo o contraseña incorrectos" };

  const next = formData.get("next");
  const target = typeof next === "string" && next ? safeNextPath(next) : await homePathFor(supabase, data.user);
  redirect(target);
}

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
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
  return { message: "Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada." };
}

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Email.safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Correo inválido" };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: appUrl("/auth/confirm?next=/reset-password"),
  });
  // Mismo mensaje exista o no la cuenta (no revelar qué correos están registrados).
  return { message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ password: Password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden" })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error || !data.user) return { error: "El enlace caducó. Solicita uno nuevo." };
  redirect(await homePathFor(supabase, data.user));
}
