"use client";

import { useState } from "react";
import { useCart } from "@/components/store/cart";
import { formatUsd } from "@/lib/print-pricing";
import { US_STATES, type StoreProduct } from "@/lib/store-types";

type Photo = { id: string; fileName: string; url: string };

export function CartView({
  projectId,
  galleryTitle,
  galleryHref,
  products,
  photos,
  shippingPerGroupCents,
  taxAtCheckout,
  buyer,
}: {
  projectId: string;
  galleryTitle: string;
  galleryHref: string;
  products: StoreProduct[];
  photos: Photo[];
  shippingPerGroupCents: number;
  taxAtCheckout: boolean;
  buyer: { name: string; email: string } | null;
}) {
  const cart = useCart(projectId);
  const productById = new Map(products.map((p) => [p.id, p]));
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const lines = cart.lines
    .map((l) => ({ line: l, product: productById.get(l.productId), photo: photoById.get(l.assetId) }))
    .filter((x): x is { line: typeof x.line; product: StoreProduct; photo: Photo } => Boolean(x.product && x.photo));
  const missing = cart.lines.length - lines.length;

  const subtotal = lines.reduce((s, x) => s + x.product.priceCents * x.line.quantity, 0);
  const groups = new Set(lines.map((x) => x.product.categoryRef)).size;
  const shipping = groups * shippingPerGroupCents;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout(form: FormData) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          items: lines.map((x) => ({ productId: x.product.id, assetId: x.photo.id, quantity: x.line.quantity })),
          buyer: { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") },
          address: {
            addr1: String(form.get("addr1") ?? ""),
            addr2: String(form.get("addr2") ?? ""),
            city: String(form.get("city") ?? ""),
            state: String(form.get("state") ?? ""),
            zip: String(form.get("zip") ?? ""),
          },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "No se pudo iniciar el pago.");
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Tu carrito está vacío</h1>
        <p className="mt-2 text-sm text-neutral-500">Abre una foto de la galería y elige “Comprar impresión”.</p>
        <a href={galleryHref} className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white">
          Ir a la galería
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.3fr_1fr]">
      <section>
        <h1 className="text-2xl font-semibold">Tu carrito</h1>
        <p className="text-sm text-neutral-500">{galleryTitle}</p>
        {missing > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Quitamos {missing} {missing === 1 ? "producto que ya no está disponible" : "productos que ya no están disponibles"}.
          </p>
        ) : null}
        <ul className="mt-5 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {lines.map(({ line, product, photo }) => (
            <li key={`${line.productId}-${line.assetId}`} className="flex gap-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 */}
              <img src={photo.url} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-lg bg-neutral-100 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {product.productName} · {product.sizeLabel}
                </p>
                <p className="truncate text-xs text-neutral-500">{photo.fileName}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center rounded-full border border-neutral-200 text-sm">
                    <button type="button" className="h-8 w-8" onClick={() => cart.setQuantity(line.productId, line.assetId, line.quantity - 1)} aria-label="Menos">
                      −
                    </button>
                    <span className="w-6 text-center tabular-nums">{line.quantity}</span>
                    <button type="button" className="h-8 w-8" onClick={() => cart.setQuantity(line.productId, line.assetId, line.quantity + 1)} aria-label="Más">
                      +
                    </button>
                  </div>
                  <button type="button" className="text-xs text-neutral-500 underline" onClick={() => cart.setQuantity(line.productId, line.assetId, 0)}>
                    Quitar
                  </button>
                </div>
              </div>
              <p className="shrink-0 font-medium tabular-nums">{formatUsd(product.priceCents * line.quantity)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Subtotal</dt>
            <dd className="tabular-nums">{formatUsd(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Envío económico{groups > 1 ? ` (${groups} paquetes)` : ""}</dt>
            <dd className="tabular-nums">{formatUsd(shipping)}</dd>
          </div>
          {taxAtCheckout ? (
            <div className="flex justify-between text-neutral-500">
              <dt>Impuestos</dt>
              <dd>Se calculan al pagar</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatUsd(subtotal + shipping)}</dd>
          </div>
        </dl>
        {groups > 1 ? (
          <p className="mt-2 text-xs text-neutral-500">Cada tipo de producto se produce y se envía en su propio paquete.</p>
        ) : null}
      </section>

      <section>
        <form action={checkout} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Envío</h2>
          <p className="-mt-2 text-xs text-neutral-500">Solo enviamos a los 48 estados contiguos de EE.UU. y DC.</p>
          <Field label="Nombre completo" name="name" defaultValue={buyer?.name} autoComplete="name" required />
          <Field label="Correo" name="email" type="email" defaultValue={buyer?.email} autoComplete="email" required />
          <Field label="Dirección" name="addr1" autoComplete="address-line1" required />
          <Field label="Apartamento, suite (opcional)" name="addr2" autoComplete="address-line2" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ciudad" name="city" autoComplete="address-level2" required />
            <Field label="Código postal" name="zip" autoComplete="postal-code" inputMode="numeric" pattern="\d{5}(-\d{4})?" required />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">Estado</span>
            <select name="state" required defaultValue="" autoComplete="address-level1" className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
              <option value="" disabled>
                Elige un estado
              </option>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button type="submit" disabled={pending} className="w-full rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Abriendo el pago…" : `Pagar ${formatUsd(subtotal + shipping)}${taxAtCheckout ? " + impuestos" : ""}`}
          </button>
          <p className="text-center text-xs text-neutral-500">Pago seguro con Stripe. Impreso por un laboratorio profesional.</p>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-neutral-700">{label}</span>
      <input name={name} className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900" {...rest} />
    </label>
  );
}
