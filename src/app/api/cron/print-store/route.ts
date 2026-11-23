import { NextResponse, type NextRequest } from "next/server";
import { whccConfigured } from "@/lib/labs/whcc";
import { syncPrintCatalog } from "@/lib/print-catalog";
import { maintainPrintOrders } from "@/lib/print-fulfillment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron diario de la tienda (vercel.json):
 *  1. Sincroniza el catálogo y los costos de WHCC (ver syncPrintCatalog).
 *  2. Reintenta pedidos pagados que no llegaron al laboratorio y vence los
 *     carritos que nunca se pagaron.
 * Vercel envía Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!whccConfigured()) return NextResponse.json({ skipped: "WHCC_API_KEY no configurada" });

  let synced = 0;
  let catalogError: string | null = null;
  try {
    synced = await syncPrintCatalog();
  } catch (err) {
    catalogError = (err as Error).message;
    console.error("[cron] Sincronización del catálogo de WHCC", err);
  }

  const orders = await maintainPrintOrders();
  return NextResponse.json({ synced, catalogError, ...orders });
}
