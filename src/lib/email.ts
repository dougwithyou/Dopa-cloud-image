import "server-only";
import { Resend } from "resend";
import { APP_NAME, appUrl, requireEnv } from "@/lib/env";

let resendClient: Resend | null = null;

function resend(): Resend {
  if (!resendClient) resendClient = new Resend(requireEnv("RESEND_API_KEY"));
  return resendClient;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM || `${APP_NAME} <hola@cloud.hidopastudio.com>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 24px;font-weight:700;font-size:18px">${escapeHtml(APP_NAME)}</p>
          <h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px">${escapeHtml(APP_NAME)} · ${escapeHtml(appUrl())}</p>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block;font-weight:600">${escapeHtml(label)}</a></p>`;
}

async function send(opts: { to: string; subject: string; html: string; text: string; replyTo?: string }) {
  const { error } = await resend().emails.send({
    from: fromAddress(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

export async function sendClientAccessEmail(opts: {
  to: string;
  clientName: string;
  creatorName: string;
  link: string;
  replyTo?: string;
}) {
  const subject = `${opts.creatorName} compartió contenido contigo`;
  const html = layout(
    `Hola ${opts.clientName}`,
    `<p style="line-height:1.6">${escapeHtml(opts.creatorName)} preparó tus fotos, videos y textos listos para publicar en un portal privado.</p>
     ${button(opts.link, "Ver mi contenido")}
     <p style="color:#666;font-size:13px;line-height:1.5">El enlace es personal y caduca en 24 horas. Si caducó, pide a ${escapeHtml(opts.creatorName)} que te reenvíe el acceso.</p>`,
  );
  const text = `Hola ${opts.clientName}:\n\n${opts.creatorName} preparó tu contenido en un portal privado.\nEntra aquí: ${opts.link}\n\nEl enlace es personal y caduca en 24 horas.`;
  await send({ to: opts.to, subject, html, text, replyTo: opts.replyTo });
}

export async function sendTrialEnding(opts: {
  to: string;
  businessName: string;
  planName: string;
  price: string;
  trialEndsAt: Date;
}) {
  const date = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric" }).format(
    opts.trialEndsAt,
  );
  const manage = appUrl("/dashboard/billing");
  const subject = `Tu prueba de ${APP_NAME} termina el ${date}`;
  const html = layout(
    "Tu prueba gratuita termina pronto",
    `<p style="line-height:1.6">Hola ${escapeHtml(opts.businessName)}, tu prueba de 30 días termina el <strong>${escapeHtml(date)}</strong>.
     Ese día se cobrará <strong>${escapeHtml(opts.price)} USD</strong> del plan <strong>${escapeHtml(opts.planName)}</strong> a la tarjeta registrada.</p>
     <p style="line-height:1.6">Si quieres cambiar de plan o cancelar, puedes hacerlo antes de esa fecha.</p>
     ${button(manage, "Gestionar suscripción")}`,
  );
  const text = `Hola ${opts.businessName}: tu prueba termina el ${date}. Ese día se cobrará ${opts.price} USD del plan ${opts.planName}. Gestiona tu suscripción en ${manage}`;
  await send({ to: opts.to, subject, html, text });
}

export async function sendPaymentFailed(opts: { to: string; businessName: string; graceDays: number }) {
  const manage = appUrl("/dashboard/billing");
  const subject = `No pudimos procesar tu pago en ${APP_NAME}`;
  const html = layout(
    "Problema con tu pago",
    `<p style="line-height:1.6">Hola ${escapeHtml(opts.businessName)}, el último cobro de tu suscripción falló.
     Mientras no se resuelva, las subidas nuevas quedan bloqueadas. Tus clientes conservan acceso a sus portales durante ${opts.graceDays} días.</p>
     ${button(manage, "Actualizar método de pago")}`,
  );
  const text = `Hola ${opts.businessName}: el último cobro falló. Las subidas están bloqueadas y tus clientes conservan acceso ${opts.graceDays} días. Actualiza tu pago en ${manage}`;
  await send({ to: opts.to, subject, html, text });
}

// ---------------------------------------------------------------------------
// Tienda de impresiones
// ---------------------------------------------------------------------------

type OrderEmailLine = { name: string; quantity: number; priceLabel: string };

function linesHtml(lines: OrderEmailLine[]): string {
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0">${lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(l.name)} × ${l.quantity}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(l.priceLabel)}</td></tr>`,
    )
    .join("")}</table>`;
}

export async function sendPrintOrderConfirmation(opts: {
  to: string;
  buyerName: string;
  businessName: string;
  reference: string;
  lines: OrderEmailLine[];
  totalLabel: string;
  orderLink: string;
}) {
  const body = `
    <p>Hola ${escapeHtml(opts.buyerName)}, recibimos tu pedido de impresiones de <strong>${escapeHtml(opts.businessName)}</strong>.</p>
    <p>Pedido <strong>${escapeHtml(opts.reference)}</strong></p>
    ${linesHtml(opts.lines)}
    <p><strong>Total: ${escapeHtml(opts.totalLabel)}</strong></p>
    <p>Lo enviaremos a producción en el laboratorio y te avisaremos cuando salga, con su número de seguimiento.</p>
    ${button(opts.orderLink, "Ver mi pedido")}`;
  await send({
    to: opts.to,
    subject: `Pedido ${opts.reference} recibido`,
    html: layout("¡Gracias por tu pedido!", body),
    text: `Recibimos tu pedido ${opts.reference} de ${opts.businessName}. Total: ${opts.totalLabel}. Míralo aquí: ${opts.orderLink}`,
  });
}

export async function sendPrintOrderShipped(opts: {
  to: string;
  buyerName: string;
  reference: string;
  tracking: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }[];
  orderLink: string;
}) {
  const list = opts.tracking
    .map((t) =>
      t.trackingUrl
        ? `<li><a href="${escapeHtml(t.trackingUrl)}">${escapeHtml(`${t.carrier ?? "Paquete"} ${t.trackingNumber ?? ""}`.trim())}</a></li>`
        : `<li>${escapeHtml(`${t.carrier ?? "Paquete"} ${t.trackingNumber ?? ""}`.trim())}</li>`,
    )
    .join("");
  await send({
    to: opts.to,
    subject: `Tu pedido ${opts.reference} va en camino`,
    html: layout("Tu pedido va en camino", `<p>Hola ${escapeHtml(opts.buyerName)}, tu pedido <strong>${escapeHtml(opts.reference)}</strong> salió del laboratorio.</p><ul>${list}</ul>${button(opts.orderLink, "Ver mi pedido")}`),
    text: `Tu pedido ${opts.reference} va en camino. Seguimiento: ${opts.tracking.map((t) => t.trackingUrl ?? t.trackingNumber).filter(Boolean).join(", ")}`,
  });
}

export async function sendPrintOrderProblem(opts: { to: string; buyerName: string; reference: string; refunded: boolean; orderLink: string }) {
  const msg = opts.refunded
    ? "No pudimos producir tu pedido y te devolvimos el dinero completo. Puede tardar de 5 a 10 días en verse en tu tarjeta."
    : "Tuvimos un problema con tu pedido. Lo estamos revisando y te escribiremos pronto.";
  await send({
    to: opts.to,
    subject: `Pedido ${opts.reference}: ${opts.refunded ? "reembolso" : "estamos revisándolo"}`,
    html: layout("Novedades de tu pedido", `<p>Hola ${escapeHtml(opts.buyerName)}, ${escapeHtml(msg)}</p>${button(opts.orderLink, "Ver mi pedido")}`),
    text: `Pedido ${opts.reference}: ${msg}`,
  });
}

export async function sendNewSaleToCreator(opts: {
  to: string;
  businessName: string;
  reference: string;
  galleryTitle: string;
  totalLabel: string;
  earningsLabel: string;
}) {
  await send({
    to: opts.to,
    subject: `Nueva venta de impresiones (${opts.reference})`,
    html: layout(
      "¡Vendiste impresiones!",
      `<p>${escapeHtml(opts.businessName)}, recibiste un pedido en la galería <strong>${escapeHtml(opts.galleryTitle)}</strong>.</p>
       <p>Total pagado: <strong>${escapeHtml(opts.totalLabel)}</strong><br>Tu ganancia: <strong>${escapeHtml(opts.earningsLabel)}</strong></p>
       <p>El laboratorio lo produce y lo envía directo a tu cliente. Recibes tu ganancia cuando el pedido se envía.</p>
       ${button(appUrl("/dashboard/orders"), "Ver mis ventas")}`,
    ),
    text: `Nueva venta ${opts.reference} en ${opts.galleryTitle}. Total ${opts.totalLabel}, tu ganancia ${opts.earningsLabel}.`,
  });
}
