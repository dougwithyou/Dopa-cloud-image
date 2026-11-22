"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { setVisitorCookie } from "@/lib/share";

export type GateState = { error?: string } | null;

const Schema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  firstName: z.string().trim().min(1, "Escribe tu nombre").max(80),
  lastName: z.string().trim().min(1, "Escribe tu apellido").max(80),
  email: z.email("Correo inválido").transform((v) => v.trim().toLowerCase()),
  consent: z.boolean(),
});

/** Registra al visitante (nombre, apellido, correo) y le da acceso a la galería. */
export async function registerVisitor(_prev: GateState, formData: FormData): Promise<GateState> {
  const parsed = Schema.safeParse({
    token: formData.get("token"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    consent: formData.get("consent") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos" };

  const { token, firstName, lastName, email, consent } = parsed.data;
  const { data, error } = await createAdminClient().rpc("register_gallery_lead", {
    p_token: token,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_consent: consent,
  });
  const row = data?.[0];
  if (error || !row) {
    return { error: "Esta galería ya no está disponible. Pide un enlace nuevo a quien te la compartió." };
  }

  await setVisitorCookie(row.project_id, row.lead_id);
  redirect(`/g/${token}`);
}
