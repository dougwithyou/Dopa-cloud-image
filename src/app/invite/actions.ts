"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcceptState = { error?: string } | null;

/**
 * Vincula al usuario autenticado con la ficha de cliente. Solo funciona si el
 * correo del usuario coincide con el correo invitado y la ficha no está ya
 * vinculada a otra cuenta.
 */
export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const { supabase, user } = await requireUser();
  const clientId = z.uuid().safeParse(formData.get("clientId"));
  if (!clientId.success) return { error: "Invitación inválida" };

  const password = formData.get("password");
  if (typeof password === "string" && password.length > 0) {
    if (password.length < 8 || password.length > 72) return { error: "La contraseña debe tener entre 8 y 72 caracteres" };
    if (password !== formData.get("confirm")) return { error: "Las contraseñas no coinciden" };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: "No se pudo guardar la contraseña. Pide una nueva invitación." };
  } else if (formData.get("requirePassword") === "1") {
    return { error: "Crea una contraseña para continuar" };
  }

  const email = user.email?.toLowerCase();
  if (!email) return { error: "Tu cuenta no tiene correo" };

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, email, user_id")
    .eq("id", clientId.data)
    .maybeSingle();

  if (!client || client.email !== email) return { error: "Esta invitación no corresponde a tu cuenta" };
  if (client.user_id && client.user_id !== user.id) return { error: "Esta invitación ya fue aceptada por otra cuenta" };

  if (!client.user_id) {
    const { error } = await admin
      .from("clients")
      .update({ user_id: user.id, accepted_at: new Date().toISOString() })
      .eq("id", client.id)
      .is("user_id", null);
    if (error) return { error: "No se pudo aceptar la invitación" };
  }

  redirect("/portal");
}
