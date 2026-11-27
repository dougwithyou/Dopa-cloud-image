import "server-only";
import { Resend } from "resend";
import { APP_NAME, appUrl, requireEnv } from "@/lib/env";
import { intlLocale, type Locale } from "@/i18n/config";
import { emailText } from "@/i18n/emails";

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

function layout(locale: Locale, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="${locale}"><body style="margin:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
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
  locale: Locale;
}) {
  const m = emailText(opts.locale).access;
  const creator = escapeHtml(opts.creatorName);
  const html = layout(
    opts.locale,
    m.title(opts.clientName),
    `<p style="line-height:1.6">${m.bodyHtml(creator)}</p>
     ${button(opts.link, m.button)}
     <p style="color:#666;font-size:13px;line-height:1.5">${m.noteHtml(creator)}</p>`,
  );
  await send({
    to: opts.to,
    subject: m.subject(opts.creatorName),
    html,
    text: m.text(opts.clientName, opts.creatorName, opts.link),
    replyTo: opts.replyTo,
  });
}

export async function sendTrialEnding(opts: {
  to: string;
  businessName: string;
  planName: string;
  price: string;
  trialEndsAt: Date;
  locale: Locale;
}) {
  const m = emailText(opts.locale).trial;
  const date = new Intl.DateTimeFormat(intlLocale(opts.locale), { day: "numeric", month: "long", year: "numeric" }).format(
    opts.trialEndsAt,
  );
  const manage = appUrl("/dashboard/billing");
  const html = layout(
    opts.locale,
    m.title,
    `<p style="line-height:1.6">${m.bodyHtml(escapeHtml(opts.businessName), escapeHtml(date), escapeHtml(opts.price), escapeHtml(opts.planName))}</p>
     <p style="line-height:1.6">${m.changeHtml}</p>
     ${button(manage, m.button)}`,
  );
  await send({
    to: opts.to,
    subject: m.subject(APP_NAME, date),
    html,
    text: m.text(opts.businessName, date, opts.price, opts.planName, manage),
  });
}

export async function sendPaymentFailed(opts: { to: string; businessName: string; graceDays: number; locale: Locale }) {
  const m = emailText(opts.locale).paymentFailed;
  const manage = appUrl("/dashboard/billing");
  const html = layout(
    opts.locale,
    m.title,
    `<p style="line-height:1.6">${m.bodyHtml(escapeHtml(opts.businessName), opts.graceDays)}</p>
     ${button(manage, m.button)}`,
  );
  await send({ to: opts.to, subject: m.subject(APP_NAME), html, text: m.text(opts.businessName, opts.graceDays, manage) });
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
  locale: Locale;
}) {
  const m = emailText(opts.locale).order;
  const body = `
    <p>${m.confirmHelloHtml(escapeHtml(opts.buyerName), escapeHtml(opts.businessName))}</p>
    <p>${m.orderRefHtml(escapeHtml(opts.reference))}</p>
    ${linesHtml(opts.lines)}
    <p>${m.totalHtml(escapeHtml(opts.totalLabel))}</p>
    <p>${m.confirmNext}</p>
    ${button(opts.orderLink, m.viewOrder)}`;
  await send({
    to: opts.to,
    subject: m.confirmSubject(opts.reference),
    html: layout(opts.locale, m.confirmTitle, body),
    text: m.confirmText(opts.reference, opts.businessName, opts.totalLabel, opts.orderLink),
  });
}

export async function sendPrintOrderShipped(opts: {
  to: string;
  buyerName: string;
  reference: string;
  tracking: { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null }[];
  orderLink: string;
  locale: Locale;
}) {
  const m = emailText(opts.locale).order;
  const list = opts.tracking
    .map((t) => {
      const label = escapeHtml(`${t.carrier ?? m.package} ${t.trackingNumber ?? ""}`.trim());
      return t.trackingUrl ? `<li><a href="${escapeHtml(t.trackingUrl)}">${label}</a></li>` : `<li>${label}</li>`;
    })
    .join("");
  await send({
    to: opts.to,
    subject: m.shippedSubject(opts.reference),
    html: layout(
      opts.locale,
      m.shippedTitle,
      `<p>${m.shippedHtml(escapeHtml(opts.buyerName), escapeHtml(opts.reference))}</p><ul>${list}</ul>${button(opts.orderLink, m.viewOrder)}`,
    ),
    text: m.shippedText(opts.reference, opts.tracking.map((t) => t.trackingUrl ?? t.trackingNumber).filter(Boolean).join(", ")),
  });
}

export async function sendPrintOrderProblem(opts: {
  to: string;
  buyerName: string;
  reference: string;
  refunded: boolean;
  orderLink: string;
  locale: Locale;
}) {
  const m = emailText(opts.locale).order;
  const msg = opts.refunded ? m.refunded : m.reviewing;
  await send({
    to: opts.to,
    subject: m.problemSubject(opts.reference, opts.refunded),
    html: layout(opts.locale, m.problemTitle, `<p>${escapeHtml(m.hello(opts.buyerName) + msg)}</p>${button(opts.orderLink, m.viewOrder)}`),
    text: m.problemText(opts.reference, msg),
  });
}

export async function sendNewSaleToCreator(opts: {
  to: string;
  businessName: string;
  reference: string;
  galleryTitle: string | null;
  totalLabel: string;
  earningsLabel: string;
  locale: Locale;
}) {
  const m = emailText(opts.locale).sale;
  const gallery = opts.galleryTitle ?? m.yourGallery;
  await send({
    to: opts.to,
    subject: m.subject(opts.reference),
    html: layout(
      opts.locale,
      m.title,
      `<p>${m.bodyHtml(escapeHtml(opts.businessName), escapeHtml(gallery))}</p>
       <p>${m.amountsHtml(escapeHtml(opts.totalLabel), escapeHtml(opts.earningsLabel))}</p>
       <p>${m.next}</p>
       ${button(appUrl("/dashboard/orders"), m.button)}`,
    ),
    text: m.text(opts.reference, gallery, opts.totalLabel, opts.earningsLabel),
  });
}
