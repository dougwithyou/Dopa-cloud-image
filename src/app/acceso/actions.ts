"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getI18n } from "@/i18n/server";

export type AccessState = { error?: string } | null;

/**
 * Vincula al usuario autenticado con su ficha de cliente. Solo funciona si el
 * correo del usuario coincide con el correo que el creador agregó y la ficha
 * no está ya vinculada a otra cuenta.
 */
export async function claimAccess(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const { supabase, user } = await requireUser();
  const a = (await getI18n()).t.auth.access;
  const clientId = z.uuid().safeParse(formData.get("clientId"));
  if (!clientId.success) return { error: a.errLink };

  const password = formData.get("password");
  if (typeof password === "string" && password.length > 0) {
    if (password.length < 8 || password.length > 72) return { error: (await getI18n()).t.auth.errors.passwordRange };
    if (password !== formData.get("confirm")) return { error: (await getI18n()).t.auth.errors.mismatch };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: a.errSave };
  } else if (formData.get("requirePassword") === "1") {
    return { error: a.errNeedPassword };
  }

  const email = user.email?.toLowerCase();
  if (!email) return { error: a.errNoEmail };

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("id, email, user_id")
    .eq("id", clientId.data)
    .maybeSingle();

  if (!client || client.email !== email) return { error: a.errNotYours };
  if (client.user_id && client.user_id !== user.id) return { error: a.errTaken };

  if (!client.user_id) {
    const { error } = await admin
      .from("clients")
      .update({ user_id: user.id, accepted_at: new Date().toISOString() })
      .eq("id", client.id)
      .is("user_id", null);
    if (error) return { error: a.errActivate };
  }

  redirect("/portal");
}
