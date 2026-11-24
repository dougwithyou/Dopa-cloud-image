"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedMedia } from "@/components/feed-post";
import { formatUsd } from "@/lib/print-pricing";
import type { StoreConfig, StoreProduct } from "@/lib/store-types";
import { useCart } from "./cart";

/** PPI por debajo del cual avisamos que la impresión puede verse borrosa. */
const MIN_PPI = 150;

/** Precio "desde" de un grupo de productos. */
function fromPrice(list: StoreProduct[]) {
  return Math.min(...list.map((p) => p.priceCents));
}

/**
 * Ventana para comprar una impresión de una foto: categoría, producto, tamaño
 * (con vista previa del recorte centrado que hace el laboratorio) y cantidad.
 */
export function BuyPrintDialog({ media, store, onClose }: { media: FeedMedia; store: StoreConfig; onClose: () => void }) {
  const cart = useCart(store.projectId);
  const categories = useMemo(() => {
    const map = new Map<string, { ref: string; name: string; products: StoreProduct[] }>();
    // Desde una foto solo se piden productos de una foto (impresiones y canvas).
    for (const p of store.products.filter((x) => x.completion === "api")) {
      const c = map.get(p.categoryRef) ?? { ref: p.categoryRef, name: p.categoryName, products: [] };
      c.products.push(p);
      map.set(p.categoryRef, c);
    }
    return [...map.values()];
  }, [store.products]);

  const [categoryRef, setCategoryRef] = useState(categories[0]?.ref ?? "");
  const category = categories.find((c) => c.ref === categoryRef) ?? categories[0];
  const productRefs = useMemo(() => {
    const map = new Map<string, StoreProduct[]>();
    for (const p of category?.products ?? []) map.set(p.productRef, [...(map.get(p.productRef) ?? []), p]);
    return [...map.entries()];
  }, [category]);
  const [productRef, setProductRef] = useState(productRefs[0]?.[0] ?? "");
  const sizes = productRefs.find(([ref]) => ref === productRef)?.[1] ?? productRefs[0]?.[1] ?? [];
  const [sizeId, setSizeId] = useState<string | null>(null);
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0];
  const [quantity, setQuantity] = useState(1);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Proporción del producto, girada según la orientación de la foto (WHCC la deduce de la imagen).
  const landscape = natural ? natural.w > natural.h : false;
  const w = size?.widthIn ?? 4;
  const h = size?.heightIn ?? 5;
  const ratio = landscape ? Math.max(w, h) / Math.min(w, h) : Math.min(w, h) / Math.max(w, h);
  const lowRes =
    natural && size?.widthIn && size?.heightIn
      ? Math.max(natural.w, natural.h) / Math.max(size.widthIn, size.heightIn) < MIN_PPI ||
        Math.min(natural.w, natural.h) / Math.min(size.widthIn, size.heightIn) < MIN_PPI
      : false;

  if (!size) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" role="dialog" aria-modal aria-label="Comprar impresión">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white text-neutral-900 sm:rounded-3xl">
        <header className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <p className="font-semibold">Comprar impresión</p>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900" aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto sm:grid-cols-[1fr_1.1fr]">
          {/* Vista previa del recorte */}
          <div className="flex flex-col items-center justify-center gap-3 bg-neutral-100 p-4 sm:p-6">
            <div className="relative w-full max-w-[150px] bg-white p-1.5 shadow-lg sm:max-w-[260px] sm:p-2" style={{ aspectRatio: `${ratio}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de R2 */}
              <img
                src={media.url}
                alt={media.file_name}
                className="h-full w-full object-cover"
                onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            </div>
            <p className="text-center text-xs text-neutral-500">Recorte centrado a {size.sizeLabel}</p>
            {lowRes ? (
              <p className="rounded-full bg-amber-100 px-3 py-1 text-center text-xs text-amber-800">
                La foto puede verse poco nítida a este tamaño. Prueba uno más pequeño.
              </p>
            ) : null}
          </div>

          {/* Opciones */}
          <div className="space-y-5 p-5">
            {categories.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.ref}
                    type="button"
                    onClick={() => {
                      setCategoryRef(c.ref);
                      setProductRef(c.products[0].productRef);
                      setSizeId(null);
                      setAdded(false);
                    }}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${c.ref === category?.ref ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:text-neutral-900"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ) : null}

            {productRefs.length > 1 ? (
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Producto</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {productRefs.map(([ref, list]) => (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => {
                        setProductRef(ref);
                        setSizeId(null);
                        setAdded(false);
                      }}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${ref === productRef ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200 hover:border-neutral-400"}`}
                    >
                      <span className="block font-medium">{list[0].productName}</span>
                      <span className="text-xs text-neutral-500">desde {formatUsd(fromPrice(list))}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-medium">{sizes[0]?.productName}</p>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Tamaño (pulgadas)</p>
              <div className="grid grid-cols-3 gap-2">
                {sizes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSizeId(s.id);
                      setAdded(false);
                    }}
                    className={`rounded-xl border px-2 py-2 text-center text-sm transition ${s.id === size.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 hover:border-neutral-400"}`}
                  >
                    <span className="block font-medium">{s.sizeLabel}</span>
                    <span className={`text-xs ${s.id === size.id ? "text-white/70" : "text-neutral-500"}`}>{formatUsd(s.priceCents)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center rounded-full border border-neutral-200">
                <button type="button" className="h-10 w-10 text-lg" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Menos">
                  −
                </button>
                <span className="w-8 text-center tabular-nums">{quantity}</span>
                <button type="button" className="h-10 w-10 text-lg" onClick={() => setQuantity((q) => Math.min(100, q + 1))} aria-label="Más">
                  +
                </button>
              </div>
              <p className="text-2xl font-semibold tabular-nums">{formatUsd(size.priceCents * quantity)}</p>
            </div>

            {added ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <a href={store.cartHref} className="flex-1 rounded-full bg-neutral-900 px-5 py-3 text-center text-sm font-semibold text-white">
                  Ver carrito ({cart.count})
                </a>
                <button type="button" onClick={onClose} className="flex-1 rounded-full border border-neutral-300 px-5 py-3 text-sm font-semibold">
                  Seguir viendo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const ok = cart.add({ productId: size.id, assetId: media.id, quantity, fileName: media.file_name });
                  setAdded(ok);
                }}
                className="w-full rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-700"
              >
                Agregar al carrito
              </button>
            )}
            <p className="text-xs text-neutral-500">
              Impreso por un laboratorio profesional y enviado a tu casa en EE.UU. Envío desde {formatUsd(store.shippingPerGroupCents)}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botón del carrito en la barra de la galería (solo si hay algo). */
export function CartButton({ store, className = "", style }: { store: StoreConfig; className?: string; style?: React.CSSProperties }) {
  const { count } = useCart(store.projectId);
  if (count === 0) return null;
  return (
    <a href={store.cartHref} className={className} style={style}>
      Carrito ({count})
    </a>
  );
}
