import { NextResponse } from "next/server";
import { getCreatorContext } from "@/lib/auth";
import { createPortalSession } from "@/lib/billing";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/** POST (formulario): abre el Customer Portal de Stripe (cambiar plan, tarjeta, cancelar). */
export async function POST() {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.redirect(appUrl("/login"), 303);
  if (!ctx.creator.stripe_customer_id) return NextResponse.redirect(appUrl("/onboarding"), 303);
  const url = await createPortalSession(ctx.creator);
  return NextResponse.redirect(url, 303);
}
