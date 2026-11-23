import { NextResponse } from "next/server";
import { getCreatorContext } from "@/lib/auth";
import { connectOnboardingUrl } from "@/lib/connect";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Inicia (o retoma) el registro de la cuenta de cobros en Stripe. */
export async function GET() {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.redirect(appUrl("/login"), 303);
  try {
    return NextResponse.redirect(await connectOnboardingUrl(ctx.creator, ctx.user.email ?? null), 303);
  } catch (err) {
    console.error("[connect] No se pudo iniciar el registro", err);
    return NextResponse.redirect(appUrl("/dashboard/store?connect=error"), 303);
  }
}
