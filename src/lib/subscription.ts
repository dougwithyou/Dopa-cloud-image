import type { CreatorRow, SubscriptionStatus } from "@/types/database";

export const UPLOAD_STATUSES: SubscriptionStatus[] = ["trialing", "active"];

/** Subidas nuevas solo con suscripción en prueba o activa. */
export function canUpload(creator: Pick<CreatorRow, "subscription_status">): boolean {
  return UPLOAD_STATUSES.includes(creator.subscription_status);
}

/** ¿Ha completado alguna vez el checkout? */
export function hasSubscription(creator: Pick<CreatorRow, "stripe_subscription_id">): boolean {
  return Boolean(creator.stripe_subscription_id);
}

/** Días completos de prueba restantes (redondeando hacia arriba). */
export function trialDaysLeft(creator: Pick<CreatorRow, "subscription_status" | "trial_ends_at">): number | null {
  if (creator.subscription_status !== "trialing" || !creator.trial_ends_at) return null;
  const ms = new Date(creator.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Misma regla que la función SQL creator_portal_open(). */
export function isPortalOpen(creator: Pick<CreatorRow, "subscription_status" | "portal_access_until">): boolean {
  if (UPLOAD_STATUSES.includes(creator.subscription_status)) return true;
  return Boolean(creator.portal_access_until && new Date(creator.portal_access_until).getTime() > Date.now());
}

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "En prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  incomplete: "Incompleta",
};
