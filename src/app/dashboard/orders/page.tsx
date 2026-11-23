import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatUsd } from "@/lib/print-pricing";
import { ORDER_STATUS_LABEL } from "@/lib/store-types";
import { ArrowRightIcon } from "@/components/icons";

export const metadata = { title: "Ventas" };

const STATUS_TONE: Record<string, string> = {
  paid: "bg-dash-yellow-soft",
  submitting: "bg-dash-yellow-soft",
  in_production: "bg-dash-blue-soft",
  shipped: "bg-green-50 text-green-800",
  refunded: "bg-neutral-100 text-neutral-500",
  canceled: "bg-neutral-100 text-neutral-500",
  failed: "bg-red-50 text-red-700",
};

export default async function OrdersPage() {
  const { supabase } = await requireCreator();
  const { data: orders } = await supabase
    .from("print_orders")
    .select("id, reference, status, buyer_name, buyer_email, total_cents, creator_earnings_cents, stripe_transfer_id, tracking, failure_reason, created_at, projects(title), print_order_items(product_name, size_label, quantity)")
    .neq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (orders ?? []).filter((o) => o.status !== "canceled" || o.failure_reason !== "Pago no completado");
  const live = list.filter((o) => !["refunded", "canceled", "failed"].includes(o.status));
  const sales = live.reduce((s, o) => s + o.total_cents, 0);
  const earned = live.reduce((s, o) => s + o.creator_earnings_cents, 0);
  const paidOut = live.filter((o) => o.stripe_transfer_id).reduce((s, o) => s + o.creator_earnings_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="dash-title">
          Ventas<sup>({live.length})</sup>
        </h1>
        <Link href="/dashboard/store" className="btn-secondary py-3">
          Tienda y precios <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Vendido", value: formatUsd(sales), tone: "bg-white" },
          { label: "Tus ganancias", value: formatUsd(earned), tone: "bg-dash-yellow" },
          { label: "Ya transferido", value: formatUsd(paidOut), tone: "bg-dash-blue text-white" },
        ].map((s) => (
          <div key={s.label} className={`rounded-[26px] p-6 ${s.tone}`}>
            <p className="text-sm opacity-70">{s.label}</p>
            <p className="mt-1 text-4xl tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">Tu ganancia se transfiere a tu cuenta de Stripe cuando el laboratorio envía el pedido.</p>

      {list.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          Todavía no hay ventas. Activa la tienda en una galería de fotos para que tus clientes puedan comprar impresiones.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id} className="rounded-[22px] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {o.buyer_name} <span className="text-sm font-normal text-neutral-500">· {o.reference}</span>
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {o.projects?.title ?? "Galería eliminada"} · {formatDate(o.created_at)}
                  </p>
                </div>
                <span className={`badge ${STATUS_TONE[o.status] ?? "bg-neutral-100"}`}>{ORDER_STATUS_LABEL[o.status]}</span>
              </div>
              <p className="mt-3 text-sm">
                {o.print_order_items.map((i) => `${i.quantity}× ${i.product_name} ${i.size_label}`).join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span>
                  Total <strong>{formatUsd(o.total_cents)}</strong>
                </span>
                <span className="text-green-700">
                  Tu ganancia <strong>{formatUsd(o.creator_earnings_cents)}</strong>
                  {o.stripe_transfer_id ? " · transferida" : ""}
                </span>
                {o.tracking.map((t, i) =>
                  t.trackingUrl ? (
                    <a key={i} href={t.trackingUrl} target="_blank" rel="noreferrer" className="underline">
                      Seguimiento {t.carrier ?? ""}
                    </a>
                  ) : null,
                )}
              </div>
              {o.failure_reason && o.status !== "canceled" ? <p className="mt-2 text-xs text-red-700">{o.failure_reason}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
