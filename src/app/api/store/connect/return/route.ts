import { NextResponse } from "next/server";
import { getCreatorContext } from "@/lib/auth";
import { refreshConnectStatus } from "@/lib/connect";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Vuelta desde Stripe: guarda si la cuenta ya puede recibir pagos. */
export async function GET() {
  const ctx = await getCreatorContext();
  if (!ctx) return NextResponse.redirect(appUrl("/login"), 303);
  const ready = await refreshConnectStatus(ctx.creator).catch(() => false);
  return NextResponse.redirect(appUrl(`/dashboard/store?connect=${ready ? "ok" : "pending"}`), 303);
}
