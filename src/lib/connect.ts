import "server-only";
import { appUrl } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CreatorRow } from "@/types/database";

/**
 * Cuenta de cobros del fotógrafo (Stripe Connect Express). La plataforma cobra
 * al cliente y, cuando el pedido se envía, transfiere al fotógrafo su ganancia.
 * Se piden "transfers" y "card_payments": Stripe no permite cuentas solo con
 * transfers sin una aprobación especial de la plataforma.
 */
export async function connectOnboardingUrl(creator: CreatorRow, email: string | null): Promise<string> {
  let accountId = creator.stripe_connect_account_id;
  if (!accountId) {
    const account = await stripe().accounts.create(
      {
        type: "express",
        country: "US",
        email: email ?? undefined,
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
        business_profile: {
          name: creator.business_name,
          product_description: "Fotografía profesional e impresiones para sus clientes",
        },
        metadata: { creator_id: creator.id },
      },
      { idempotencyKey: `connect-account-v2-${creator.id}` },
    );
    accountId = account.id;
    await createAdminClient().from("creators").update({ stripe_connect_account_id: accountId }).eq("id", creator.id);
  }
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl("/api/store/connect"),
    return_url: appUrl("/api/store/connect/return"),
  });
  return link.url;
}

/** Lee el estado en Stripe y lo guarda. Devuelve si ya puede recibir pagos. */
export async function refreshConnectStatus(creator: CreatorRow): Promise<boolean> {
  if (!creator.stripe_connect_account_id) return false;
  const account = await stripe().accounts.retrieve(creator.stripe_connect_account_id);
  const ready = Boolean(account.payouts_enabled && account.capabilities?.transfers === "active");
  if (ready !== creator.connect_payouts_enabled) {
    await createAdminClient().from("creators").update({ connect_payouts_enabled: ready }).eq("id", creator.id);
  }
  return ready;
}
