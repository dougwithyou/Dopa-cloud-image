import { NextResponse, type NextRequest } from "next/server";
import { getCreatorContext } from "@/lib/auth";
import { createCheckoutSession } from "@/lib/billing";
import { isPlanId } from "@/lib/plans";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST (formulario) con `plan`. Crea una sesión de Stripe Checkout y redirige.
 * Usado desde /dashboard/billing para volver a suscribirse tras cancelar.
 * El alta inicial pasa por la Server Action de /onboarding.
 */
export async function POST(req: NextRequest) {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.redirect(appUrl("/login"), 303);

  const form = await req.formData();
  const plan = form.get("plan");
  if (!isPlanId(plan)) return NextResponse.json({ error: "Plan inválido" }, { status: 400 });

  const { creator } = ctx;
  if (creator.stripe_subscription_id && creator.subscription_status !== "canceled") {
    // Ya tiene suscripción viva: los cambios de plan se hacen en el Customer Portal.
    return NextResponse.redirect(appUrl("/dashboard/billing?notice=use-portal"), 303);
  }

  const url = await createCheckoutSession(creator, plan, ctx.user.email);
  return NextResponse.redirect(url, 303);
}
