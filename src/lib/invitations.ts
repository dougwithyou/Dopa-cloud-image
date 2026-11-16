import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/env";
import { sendClientInvite } from "@/lib/email";
import type { ClientRow, CreatorRow } from "@/types/database";

/**
 * Genera un enlace de Supabase Auth SIN que Supabase envíe correo y lo manda
 * con Resend desde invite@cloud.hidopastudio.com.
 *  - Usuario nuevo  -> enlace 'invite' (el cliente crea su contraseña).
 *  - Usuario existente (p. ej. cliente de otro creador) -> enlace 'magiclink'.
 */
export async function sendInvitation(
  client: Pick<ClientRow, "id" | "name" | "email">,
  creator: Pick<CreatorRow, "business_name">,
  replyTo?: string,
): Promise<void> {
  const admin = createAdminClient();

  let type: "invite" | "magiclink" = "invite";
  let next = `/invite/accept?client=${client.id}&new=1`;
  let result = await admin.auth.admin.generateLink({
    type: "invite",
    email: client.email,
    options: { redirectTo: appUrl(next) },
  });

  if (result.error && (result.error.code === "email_exists" || result.error.status === 422)) {
    type = "magiclink";
    next = `/invite/accept?client=${client.id}`;
    result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: client.email,
      options: { redirectTo: appUrl(next) },
    });
  }

  const hashedToken = result.data?.properties?.hashed_token;
  if (result.error || !hashedToken) {
    throw new Error(`No se pudo generar la invitación: ${result.error?.message ?? "sin token"}`);
  }

  const link = appUrl(
    `/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent(next)}`,
  );

  await sendClientInvite({
    to: client.email,
    clientName: client.name,
    creatorName: creator.business_name,
    link,
    replyTo,
  });

  await admin.from("clients").update({ invited_at: new Date().toISOString() }).eq("id", client.id);
}
