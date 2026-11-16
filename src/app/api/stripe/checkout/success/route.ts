import { NextResponse, type NextRequest } from "next/server";
import { getCreatorContext } from "@/lib/auth";
import { syncSubscription } from "@/lib/billing";
import { stripe } from "@/lib/stripe";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * success_url de Checkout. Sincroniza la suscripción en el momento (sin
 * esperar al webhook, que puede tardar unos segundos) y entra al panel.
 * Es idempotente con el webhook: ambos leen el estado actual de Stripe.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.redirect(appUrl("/login"));

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (sessionId) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      const ownsSession =
        session.client_reference_id === ctx.creator.id ||
        (session.customer && session.customer === ctx.creator.stripe_customer_id);
      if (ownsSession && session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(subId, ctx.creator.id);
      }
    } catch (err) {
      console.error("[checkout] No se pudo sincronizar la sesión", err);
    }
  }
  return NextResponse.redirect(appUrl("/dashboard?checkout=success"));
}
