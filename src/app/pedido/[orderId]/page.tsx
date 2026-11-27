import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/print-pricing";
import { verifyOrderToken } from "@/lib/store";
import { ClearCart } from "./clear-cart";
import { getI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.store.orderMeta, robots: { index: false, follow: false } };
}

const STEPS = ["paid", "in_production", "shipped"] as const;

function stepIndex(status: string): number {
  if (status === "shipped") return 2;
  if (status === "in_production") return 1;
  if (status === "paid" || status === "submitting") return 0;
  return -1;
}

/** Estado del pedido para el comprador (enlace privado firmado, sin cuenta). */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ t?: string; pagado?: string }>;
}) {
  const { orderId } = await params;
  const { t: token, pagado } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(orderId) && verifyOrderToken(orderId, token);
  const { t, locale } = await getI18n();
  const s = t.store;
  const admin = createAdminClient();
  const order = valid ? (await admin.from("print_orders").select("*").eq("id", orderId).maybeSingle()).data : null;

  if (!order) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-50 px-4 text-center">
        <h1 className="text-2xl font-semibold">{s.orderNotFound}</h1>
        <p className="mt-2 max-w-sm text-sm text-neutral-500">{s.orderNotFoundText}</p>
      </main>
    );
  }

  const [{ data: items }, { data: creator }] = await Promise.all([
    admin.from("print_order_items").select("product_name, size_label, file_name, quantity, unit_price_cents").eq("order_id", order.id).order("created_at"),
    admin.from("creators").select("business_name").eq("id", order.creator_id).single(),
  ]);
  const waiting = order.status === "pending_payment" && pagado === "1";
  const current = stepIndex(order.status);
  const address = order.shipping_address;

  return (
    <main className="min-h-dvh bg-neutral-50 px-4 py-10 text-neutral-900">
      {waiting ? <meta httpEquiv="refresh" content="4" /> : null}
      {pagado === "1" && order.project_id ? <ClearCart projectId={order.project_id} /> : null}
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <p className="text-sm text-neutral-500">{creator?.business_name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {waiting ? s.confirming : pagado === "1" ? s.thanks : s.yourOrder}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {order.reference} · {formatDate(order.created_at, locale)}
          </p>
        </div>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          {current >= 0 ? (
            <ol className="grid grid-cols-3 gap-2 text-center text-xs">
              {STEPS.map((key, i) => (
                <li key={key}>
                  <span className={`mx-auto block h-1.5 rounded-full ${i <= current ? "bg-neutral-900" : "bg-neutral-200"}`} />
                  <span className={`mt-2 block ${i <= current ? "font-semibold" : "text-neutral-400"}`}>{t.labels.orderStatus[key]}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-center text-sm">
              <strong>{t.labels.orderStatus[order.status]}</strong>
              {order.status === "refunded" ? s.refunded : ""}
            </p>
          )}
          {order.tracking.length > 0 ? (
            <div className="mt-4 space-y-1 text-sm">
              {order.tracking.map((tr, i) => (
                <p key={i}>
                  {tr.carrier ?? s.package}:{" "}
                  {tr.trackingUrl ? (
                    <a href={tr.trackingUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                      {tr.trackingNumber ?? s.tracking}
                    </a>
                  ) : (
                    tr.trackingNumber
                  )}
                </p>
              ))}
            </div>
          ) : current >= 0 && current < 2 ? (
            <p className="mt-4 text-center text-xs text-neutral-500">
              {s.willEmail(order.buyer_email)}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5">
          <ul className="divide-y divide-neutral-100 text-sm">
            {(items ?? []).map((it, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  {it.quantity}× {it.product_name} {it.size_label}
                  <span className="block truncate text-xs text-neutral-500">{it.file_name}</span>
                </span>
                <span className="tabular-nums">{formatUsd(it.unit_price_cents * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-neutral-100 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">{s.shippingShort}</dt>
              <dd className="tabular-nums">{formatUsd(order.shipping_cents)}</dd>
            </div>
            {order.tax_cents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-neutral-500">{s.taxes}</dt>
                <dd className="tabular-nums">{formatUsd(order.tax_cents)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between font-semibold">
              <dt>{s.total}</dt>
              <dd className="tabular-nums">{formatUsd(order.total_cents || order.subtotal_cents + order.shipping_cents)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm">
          <p className="font-medium">{s.shipsTo}</p>
          <p className="mt-1 text-neutral-600">
            {address.name}
            <br />
            {address.addr1}
            {address.addr2 ? `, ${address.addr2}` : ""}
            <br />
            {address.city}, {address.state} {address.zip}
          </p>
        </section>
      </div>
    </main>
  );
}
