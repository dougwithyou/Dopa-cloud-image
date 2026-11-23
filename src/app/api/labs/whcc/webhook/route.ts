import { NextResponse, type NextRequest } from "next/server";
import { parseWebhook, verifyWebhookSignature, LAB_ID } from "@/lib/labs/whcc";
import { applyLabEvent } from "@/lib/print-fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eventos de pedidos de WHCC (suscripción versión 2): aceptado, rechazado,
 * enviado y cancelado. Se verifica la firma WHCC-Signature y se procesa cada
 * evento una sola vez (WHCC entrega "al menos una vez").
 * Un 4xx es terminal para WHCC; un 5xx hace que reintente.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WHCC_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("whcc-signature"), secret)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const ev = parseWebhook(json);
  if (!ev.eventType || !ev.confirmationId) return NextResponse.json({ error: "Evento incompleto" }, { status: 400 });

  // ConfirmationId + SequenceNumber + tipo identifican la entrega (un pedido
  // dividido comparte ConfirmationId). Un envío con varios paquetes puede
  // llegar en varias entregas: se incluye el seguimiento.
  const tracking = ev.shipping.map((s) => s.trackingNumber).filter(Boolean).join("|");
  const id = `${ev.confirmationId}:${ev.sequenceNumber}:${ev.eventType}${tracking ? `:${tracking}` : ""}`;
  const admin = createAdminClient();
  const claim = await admin.from("lab_events").insert({ id, lab: LAB_ID, event_type: ev.eventType, payload: json });
  if (claim.error) {
    if (claim.error.code !== "23505") throw claim.error;
    const { data: existing } = await admin.from("lab_events").select("processed_at").eq("id", id).single();
    if (existing?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await applyLabEvent(ev);
    await admin.from("lab_events").update({ processed_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[whcc] Error procesando ${id}`, err);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }
}
