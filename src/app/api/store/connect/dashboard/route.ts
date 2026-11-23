import { NextResponse } from "next/server";
import { getCreatorContext } from "@/lib/auth";
import { appUrl } from "@/lib/env";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Abre el panel de Stripe Express del fotógrafo (pagos recibidos, cuenta bancaria). */
export async function GET() {
  const ctx = await getCreatorContext();
  if (!ctx?.creator.stripe_connect_account_id) return NextResponse.redirect(appUrl("/dashboard/store"), 303);
  const link = await stripe().accounts.createLoginLink(ctx.creator.stripe_connect_account_id);
  return NextResponse.redirect(link.url, 303);
}
