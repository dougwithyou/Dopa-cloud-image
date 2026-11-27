"use client";

import { useState } from "react";
import { useCart } from "@/components/store/cart";
import { useI18n } from "@/i18n/client";
import { formatUsd } from "@/lib/print-pricing";
import { normalizeQuantity } from "@/lib/print-offerings";
import { US_STATES, lineKey, type CartLine, type StoreProduct } from "@/lib/store-types";

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
  const s = useI18n().t.store;
  const productById = new Map(products.map((p) => [p.id, p]));
  const photoById = new Map(photos.map((p) => [p.id, p]));
  type Row = { key: string; line: CartLine; product: StoreProduct; photo: Photo | null; unitCents: number };
  const lines: Row[] = [];
  for (const l of cart.lines) {
    const product = productById.get(l.productId);
    if (!product) continue;
    if (l.editorItemId) {
      if (product.completion !== "editor") continue;
      lines.push({ key: lineKey(l), line: l, product, photo: null, unitCents: l.unitPriceCents ?? product.priceCents });
    } else {
      const photo = l.assetId ? photoById.get(l.assetId) : undefined;
      if (!photo || product.completion !== "api") continue;
      lines.push({ key: lineKey(l), line: l, product, photo, unitCents: product.priceCents });
    }
  }
  const missing = cart.lines.length - lines.length;

  const subtotal = lines.reduce((s, x) => s + x.unitCents * x.line.quantity, 0);
  // Estimado: impresiones/canvas por categoría; cada photobook o juego de tarjetas va en su propio paquete.
  const groups = new Set(lines.filter((x) => !x.line.editorItemId).map((x) => x.product.categoryRef)).size + lines.filter((x) => x.line.editorItemId).length;
  const shipping = groups * shippingPerGroupCents;
  const hasDesigns = lines.some((x) => x.line.editorItemId);
  const [editing, setEditing] = useState<string | null>(null);

  async function editDesign(editorItemId: string) {
    setEditing(editorItemId);
    const res = await fetch("/api/store/editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, editorItemId }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (data.url) window.location.href = data.url;
    else {
      setEditing(null);
      setError(data.error ?? s.openEditorFailed);
    }
  }

  function step(x: Row, dir: 1 | -1) {
    const { minQuantity, quantityStep, kind } = x.product;
    if (kind === "card") {
      const next = x.line.quantity + dir * quantityStep;
      cart.setQuantity(x.key, next < minQuantity ? (dir < 0 ? 0 : minQuantity) : normalizeQuantity(next, minQuantity, quantityStep));
    } else {
      cart.setQuantity(x.key, Math.min(x.line.editorItemId ? 10 : 100, x.line.quantity + dir));
    }
  }

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
          items: lines.map((x) =>
            x.line.editorItemId
              ? { productId: x.product.id, editorItemId: x.line.editorItemId, quantity: x.line.quantity }
              : { productId: x.product.id, assetId: x.photo!.id, quantity: x.line.quantity },
          ),
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
      if (!res.ok || !data.url) throw new Error(data.error ?? s.checkoutFailed);
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">{s.emptyTitle}</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {s.emptyText}
        </p>
        <a href={galleryHref} className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white">
          {s.goGallery}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.3fr_1fr]">
      <section>
        <h1 className="text-2xl font-semibold">{s.yourCart}</h1>
        <p className="text-sm text-neutral-500">{galleryTitle}</p>
        {missing > 0 ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
            {s.removedMissing(missing)}
          </p>
        ) : null}
        <ul className="mt-5 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
          {lines.map((x) => (
            <li key={x.key} className="flex gap-4 p-4">
              {x.photo?.url || x.line.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 o vista previa de WHCC
                <img
                  src={(x.photo?.url ?? x.line.previewUrl) as string}
                  alt=""
                  loading="lazy"
                  className={`h-20 w-20 shrink-0 rounded-lg bg-neutral-100 ${x.photo ? "object-cover" : "object-contain"}`}
                />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-400 uppercase">
                  {x.product.kind === "card" ? s.card : s.book}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {x.product.productName} · {x.product.sizeLabel}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {x.photo ? x.photo.fileName : x.product.kind === "card" ? s.eachMin(formatUsd(x.unitCents), x.product.minQuantity) : s.yourDesign}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="flex items-center rounded-full border border-neutral-200 text-sm">
                    <button type="button" className="h-8 w-8" onClick={() => step(x, -1)} aria-label={s.less}>
                      −
                    </button>
                    <span className="min-w-6 px-1 text-center tabular-nums">{x.line.quantity}</span>
                    <button type="button" className="h-8 w-8" onClick={() => step(x, 1)} aria-label={s.more}>
                      +
                    </button>
                  </div>
                  {x.line.editorItemId ? (
                    <button
                      type="button"
                      disabled={editing !== null}
                      className="text-xs font-medium underline disabled:opacity-50"
                      onClick={() => editDesign(x.line.editorItemId!)}
                    >
                      {editing === x.line.editorItemId ? s.opening : s.editDesign}
                    </button>
                  ) : null}
                  <button type="button" className="text-xs text-neutral-500 underline" onClick={() => cart.remove(x.key)}>
                    {s.remove}
                  </button>
                </div>
              </div>
              <p className="shrink-0 font-medium tabular-nums">{formatUsd(x.unitCents * x.line.quantity)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">{s.subtotal}</dt>
            <dd className="tabular-nums">{formatUsd(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">
              {s.shipping(groups, hasDesigns)}
            </dt>
            <dd className="tabular-nums">{formatUsd(shipping)}</dd>
          </div>
          {taxAtCheckout ? (
            <div className="flex justify-between text-neutral-500">
              <dt>{s.taxes}</dt>
              <dd>{s.taxesAtCheckout}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
            <dt>{s.total}</dt>
            <dd className="tabular-nums">{formatUsd(subtotal + shipping)}</dd>
          </div>
        </dl>
        {groups > 1 ? (
          <p className="mt-2 text-xs text-neutral-500">{s.ownPackage}</p>
        ) : null}
        {hasDesigns ? (
          <p className="mt-1 text-xs text-neutral-500">{s.designPriceNote}</p>
        ) : null}
      </section>

      <section>
        <form action={checkout} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{s.shippingTitle}</h2>
          <p className="-mt-2 text-xs text-neutral-500">{s.shippingArea}</p>
          <Field label={s.fullName} name="name" defaultValue={buyer?.name} autoComplete="name" required />
          <Field label={s.email} name="email" type="email" defaultValue={buyer?.email} autoComplete="email" required />
          <Field label={s.address} name="addr1" autoComplete="address-line1" required />
          <Field label={s.address2} name="addr2" autoComplete="address-line2" />
          <div className="grid grid-cols-2 gap-3">
            <Field label={s.city} name="city" autoComplete="address-level2" required />
            <Field label={s.zip} name="zip" autoComplete="postal-code" inputMode="numeric" pattern="\d{5}(-\d{4})?" required />
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">{s.state}</span>
            <select name="state" required defaultValue="" autoComplete="address-level1" className="block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
              <option value="" disabled>
                {s.pickState}
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
            {pending ? s.openingCheckout : s.pay(formatUsd(subtotal + shipping), taxAtCheckout)}
          </button>
          <p className="text-center text-xs text-neutral-500">{s.secure}</p>
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
