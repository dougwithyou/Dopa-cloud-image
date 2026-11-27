import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/env";
import { sendClientAccessEmail } from "@/lib/email";
import type { ClientRow, CreatorRow } from "@/types/database";

/**
 * Envía al cliente su enlace de acceso al portal. Genera el enlace con
 * Supabase Auth SIN que Supabase envíe correo, y lo manda con Resend.
 *  - Usuario nuevo  -> enlace tipo 'invite' de Supabase (el cliente crea su contraseña).
 *  - Usuario existente (p. ej. cliente de otro creador) -> enlace 'magiclink'.
 * (Los tipos 'invite'/'magiclink' son nombres internos de Supabase; el
 * cliente nunca ve la palabra "invitación".)
 */
export async function sendClientAccess(
  client: Pick<ClientRow, "id" | "name" | "email">,
  creator: Pick<CreatorRow, "business_name" | "locale">,
  replyTo?: string,
): Promise<void> {
  const admin = createAdminClient();

  let type: "invite" | "magiclink" = "invite";
  let next = `/acceso?client=${client.id}&new=1`;
  let result = await admin.auth.admin.generateLink({
    type: "invite",
    email: client.email,
    options: { redirectTo: appUrl(next) },
  });

  if (result.error && (result.error.code === "email_exists" || result.error.status === 422)) {
    type = "magiclink";
    next = `/acceso?client=${client.id}`;
    result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: client.email,
      options: { redirectTo: appUrl(next) },
    });
  }

  const hashedToken = result.data?.properties?.hashed_token;
  if (result.error || !hashedToken) {
    throw new Error(`No se pudo generar el enlace de acceso: ${result.error?.message ?? "sin token"}`);
  }

  const link = appUrl(
    `/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${type}&next=${encodeURIComponent(next)}`,
  );

  await sendClientAccessEmail({
    to: client.email,
    clientName: client.name,
    creatorName: creator.business_name,
    link,
    replyTo,
    locale: creator.locale,
  });

  // invited_at = fecha en que se envió el acceso.
  await admin.from("clients").update({ invited_at: new Date().toISOString() }).eq("id", client.id);
}
