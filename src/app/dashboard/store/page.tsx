import Link from "next/link";
import { after } from "next/server";
import { requireCreator } from "@/lib/auth";
import { refreshConnectStatus } from "@/lib/connect";
import { whccConfigured } from "@/lib/labs/whcc";
import { PLANS } from "@/lib/plans";
import { syncPrintCatalog } from "@/lib/print-catalog";
import { estimateProcessingFeeCents, formatUsd, retailPriceCents, settle, MIN_MARKUP_PERCENT } from "@/lib/print-pricing";
import { SubmitButton } from "@/components/submit-button";
import { ArrowRightIcon, CheckIcon, ImageIcon } from "@/components/icons";
import { saveProductSettings, updateStoreMarkup } from "./actions";

export const metadata = { title: "Tienda" };

export default async function StorePage({ searchParams }: { searchParams: Promise<{ connect?: string }> }) {
  const { supabase, creator } = await requireCreator();
  const { connect } = await searchParams;
  const labReady = whccConfigured();

  // Estado de cobros al día (por si terminó el registro en otra pestaña).
  let payoutsReady = creator.connect_payouts_enabled;
  if (creator.stripe_connect_account_id && !payoutsReady) {
    payoutsReady = await refreshConnectStatus(creator).catch(() => false);
  }

  const [{ data: products }, { data: overrides }, { count: storeGalleries }] = await Promise.all([
    supabase.from("print_products").select("*").eq("active", true).order("sort"),
    supabase.from("creator_product_prices").select("product_id, markup_percent, enabled"),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("store_enabled", true),
  ]);

  // Primera vez: el catálogo se carga en segundo plano.
  const catalogEmpty = (products ?? []).length === 0;
  if (labReady && catalogEmpty) after(() => syncPrintCatalog().catch((e) => console.error("[store] sync", e)));

  const feePercent = PLANS[creator.plan].storeFeePercent;
  const byId = new Map((overrides ?? []).map((o) => [o.product_id, o]));
  const groups = new Map<string, { ref: string; name: string; category: string; description: string | null; rows: NonNullable<typeof products> }>();
  for (const p of products ?? []) {
    const g = groups.get(p.product_ref) ?? { ref: p.product_ref, name: p.product_name, category: p.category_name, description: p.description, rows: [] };
    g.rows.push(p);
    groups.set(p.product_ref, g);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="dash-title">Tienda</h1>
          <p className="mt-2 max-w-xl text-neutral-500">
            Tus clientes compran impresiones y cuadros desde la galería. El laboratorio WHCC los produce y los envía directo a su casa,
            sin marcas. Tú pones el precio.
          </p>
        </div>
        <Link href="/dashboard/orders" className="btn-secondary py-3">
          Ver ventas <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      {!labReady ? (
        <p className="rounded-2xl bg-dash-yellow-soft px-5 py-4 text-sm">
          La tienda de impresiones se está terminando de conectar con el laboratorio. Puedes preparar tus cobros mientras tanto.
        </p>
      ) : null}
      {connect === "error" ? (
        <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">No se pudo abrir el registro de cobros. Inténtalo de nuevo.</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Cobros */}
        <section className="relative overflow-hidden rounded-[26px] bg-neutral-950 p-6 text-white">
          <p className="text-xs tracking-[0.12em] text-white/50 uppercase">Paso 1</p>
          <h2 className="mt-1 text-xl">Cobros</h2>
          {payoutsReady ? (
            <>
              <p className="mt-3 flex items-center gap-2 text-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-dash-yellow text-neutral-950">
                  <CheckIcon className="h-3 w-3" />
                </span>
                Cuenta lista para recibir tus ganancias.
              </p>
              <a href="/api/store/connect/dashboard" className="btn mt-5 rounded-full bg-white/10 px-5 text-white hover:bg-white/20">
                Ver mis pagos en Stripe
              </a>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-white/65">
                {creator.stripe_connect_account_id
                  ? "Falta completar tu registro en Stripe para recibir pagos."
                  : "Conecta una cuenta bancaria con Stripe para recibir tus ganancias de cada venta."}
              </p>
              <a href="/api/store/connect" className="btn-brand mt-5">
                {creator.stripe_connect_account_id ? "Completar registro" : "Conectar cobros"}
              </a>
            </>
          )}
        </section>

        {/* 2. Margen */}
        <section className="rounded-[26px] bg-white p-6">
          <p className="text-xs tracking-[0.12em] text-neutral-400 uppercase">Paso 2</p>
          <h2 className="mt-1 text-xl">Tu margen</h2>
          <p className="mt-2 text-sm text-neutral-500">Sobre el costo del laboratorio. 100 % duplica el costo. Mínimo {MIN_MARKUP_PERCENT} %.</p>
          <form action={updateStoreMarkup} className="mt-4 flex items-center gap-2">
            <div className="relative w-28">
              <input
                name="markup"
                type="number"
                min={MIN_MARKUP_PERCENT}
                max={1000}
                defaultValue={creator.store_markup_percent}
                className="input pr-8"
                aria-label="Margen por defecto"
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-400">%</span>
            </div>
            <SubmitButton className="btn-primary" pendingLabel="…">
              Guardar
            </SubmitButton>
          </form>
          <p className="mt-3 text-xs text-neutral-500">
            Comisión de Hi Dopa Cloud en tu plan {PLANS[creator.plan].name}: {feePercent} % de tu margen. Stripe cobra 2.9 % + 30¢ por pago.
          </p>
        </section>

        {/* 3. Galerías */}
        <section className="rounded-[26px] bg-dash-yellow p-6">
          <p className="text-xs tracking-[0.12em] text-black/50 uppercase">Paso 3</p>
          <h2 className="mt-1 text-xl">Actívala en tus galerías</h2>
          <p className="mt-2 text-sm text-black/65">
            En cada galería de fotos, activa “Tienda de impresiones”. Tus clientes verán “Comprar impresión” en cada foto.
          </p>
          <p className="mt-4 text-3xl tracking-tight">
            {storeGalleries ?? 0} <span className="text-base">{storeGalleries === 1 ? "galería con tienda" : "galerías con tienda"}</span>
          </p>
        </section>
      </div>

      {/* Lista de precios */}
      <section className="rounded-[26px] bg-white p-5 sm:p-7">
        <h2 className="text-2xl tracking-tight">Lista de precios</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Precios redondeados a .99. Puedes poner un margen distinto por producto o quitarlo de tu tienda. El envío se cobra aparte, al costo.
        </p>

        {catalogEmpty ? (
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-dash-bg px-5 py-6 text-sm text-neutral-600">
            <ImageIcon className="h-5 w-5" />
            {labReady ? "Cargando el catálogo del laboratorio… vuelve a abrir esta página en un minuto." : "El catálogo aparecerá cuando el laboratorio esté conectado."}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {[...groups.values()].map((g) => {
              const override = byId.get(g.rows[0].id);
              const markup = override?.markup_percent ?? creator.store_markup_percent;
              const enabled = override?.enabled ?? true;
              return (
                <details key={g.ref} className="group rounded-2xl border border-black/10 open:bg-dash-bg/50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                    <span className="min-w-0">
                      <span className="block font-medium">{g.name}</span>
                      <span className="block text-xs text-neutral-500">
                        {g.category} · {g.rows.length} {g.rows.length === 1 ? "tamaño" : "tamaños"} · desde{" "}
                        {formatUsd(Math.min(...g.rows.map((r) => retailPriceCents(r.cost_cents, markup))))}
                      </span>
                    </span>
                    <span className={`badge shrink-0 ${enabled ? "bg-dash-blue-soft text-neutral-900" : "bg-neutral-100 text-neutral-500"}`}>
                      {enabled ? `Margen ${markup} %` : "Oculto"}
                    </span>
                  </summary>
                  <div className="border-t border-black/10 px-5 py-4">
                    <form action={saveProductSettings} className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="productRef" value={g.ref} />
                      <label className="text-sm">
                        <span className="label">Margen de este producto</span>
                        <span className="relative block w-32">
                          <input
                            name="markup"
                            type="number"
                            min={MIN_MARKUP_PERCENT}
                            max={1000}
                            defaultValue={override?.markup_percent ?? ""}
                            placeholder={`${creator.store_markup_percent}`}
                            className="input pr-8"
                          />
                          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-400">%</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 pb-2 text-sm">
                        <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-neutral-950" />
                        Mostrar en mi tienda
                      </label>
                      <SubmitButton className="btn-primary" pendingLabel="Guardando…">
                        Guardar
                      </SubmitButton>
                    </form>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead className="text-left text-xs text-neutral-500">
                          <tr>
                            <th className="py-2 font-medium">Tamaño</th>
                            <th className="py-2 font-medium">Costo lab</th>
                            <th className="py-2 font-medium">Tu precio</th>
                            <th className="py-2 font-medium">Tu ganancia aprox.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {g.rows.map((r) => {
                            const price = retailPriceCents(r.cost_cents, markup);
                            const { creatorEarningsCents } = settle(price - r.cost_cents, feePercent, estimateProcessingFeeCents(price));
                            return (
                              <tr key={r.id}>
                                <td className="py-2">{r.size_label}</td>
                                <td className="py-2 text-neutral-500">{formatUsd(r.cost_cents)}</td>
                                <td className="py-2 font-medium">{formatUsd(price)}</td>
                                <td className="py-2 text-green-700">{formatUsd(creatorEarningsCents)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
