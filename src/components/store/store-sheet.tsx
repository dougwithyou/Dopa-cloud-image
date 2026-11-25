"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeedMedia } from "@/components/feed-post";
import { formatUsd } from "@/lib/print-pricing";
import { CARD_OCCASIONS, KIND_LABEL } from "@/lib/print-offerings";
import { isLowResolution, isPrintable, type StoreConfig, type StoreProduct } from "@/lib/store-types";
import { useCart } from "./cart";
import { GalleryPhotoPicker, type PhotoPixels } from "./gallery-photo-picker";

/** Máximo de fotos que se cargan en el editor de WHCC. */
const MAX_EDITOR_PHOTOS = 100;

type Tab = "prints" | "book" | "card";
type Design = { id: string; name: string; subtitle: string; previewUrl: string | null };

/** Abre el editor de WHCC (photobook o tarjeta) y lleva al cliente allí. */
async function openEditor(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/store/editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (data.url) {
    window.location.href = data.url;
    return null;
  }
  return data.error ?? "No se pudo abrir el editor.";
}

function fromPrice(list: StoreProduct[]) {
  return list.length ? Math.min(...list.map((p) => p.priceCents)) : 0;
}

/**
 * Tienda de la galería. En todos los productos se eligen fotos de la galería
 * (las que están en línea, no las del teléfono): impresiones y canvas aquí
 * mismo; photobooks y tarjetas antes de abrir el editor de WHCC, que solo
 * recibe esas fotos.
 */
export function StoreSheet({ store, media, onClose }: { store: StoreConfig; media: FeedMedia[]; onClose: () => void }) {
  const cart = useCart(store.projectId);
  const photos = useMemo(() => media.filter((m) => isPrintable(m)), [media]);
  // Paso "elige tus fotos" antes de abrir el editor (libro o tarjeta).
  const [pick, setPick] = useState<{ productId: string; designId?: string; title: string } | null>(null);
  const photoProducts = store.products.filter((p) => p.completion === "api");
  const books = store.products.filter((p) => p.kind === "book");
  const cards = store.products.filter((p) => p.kind === "card");
  const tabs = (
    [
      ["prints", "Impresiones y canvas", photoProducts.length > 0],
      ["book", KIND_LABEL.book, books.length > 0],
      ["card", KIND_LABEL.card, cards.length > 0],
    ] as [Tab, string, boolean][]
  ).filter(([, , show]) => show);
  const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? "prints");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const start = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const err = await openEditor({ projectId: store.projectId, ...body });
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:p-6" role="dialog" aria-modal aria-label="Tienda">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-white text-neutral-900 sm:rounded-3xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <p className="font-semibold">Tienda</p>
          <div className="flex items-center gap-3">
            {cart.count > 0 ? (
              <a href={store.cartHref} className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white">
                Carrito ({cart.count})
              </a>
            ) : null}
            <button type="button" onClick={onClose} className="text-2xl leading-none text-neutral-400 hover:text-neutral-900" aria-label="Cerrar">
              ×
            </button>
          </div>
        </header>
        {pick ? null : (
          <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-neutral-100 px-5 py-3">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${id === tab ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
          {pick ? (
            <PhotoStep
              title={pick.title}
              photos={photos}
              busy={busy}
              onBack={() => setPick(null)}
              onContinue={(assetIds) => start({ productId: pick.productId, ...(pick.designId ? { designId: pick.designId } : {}), assetIds })}
            />
          ) : (
            <>
              {tab === "prints" ? <PrintsTab products={photoProducts} photos={photos} projectId={store.projectId} cartHref={store.cartHref} /> : null}
              {tab === "book" ? (
                <BooksTab
                  books={books}
                  busy={busy}
                  onDesign={(product) => setPick({ productId: product.id, title: `${product.productName} · ${product.sizeLabel}` })}
                />
              ) : null}
              {tab === "card" ? (
                <CardsTab
                  cards={cards}
                  projectId={store.projectId}
                  busy={busy}
                  onDesign={(product, designId, name) => setPick({ productId: product.id, designId, title: `${product.productName} · ${name}` })}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PrintsTab({
  products,
  photos,
  projectId,
  cartHref,
}: {
  products: StoreProduct[];
  photos: FeedMedia[];
  projectId: string;
  cartHref: string;
}) {
  const cart = useCart(projectId);
  const groups = useMemo(() => {
    const m = new Map<string, StoreProduct[]>();
    for (const p of products) m.set(p.productRef, [...(m.get(p.productRef) ?? []), p]);
    return [...m.values()];
  }, [products]);
  const [ref, setRef] = useState(groups[0]?.[0].productRef ?? "");
  const sizes = groups.find((g) => g[0].productRef === ref) ?? groups[0] ?? [];
  const [sizeId, setSizeId] = useState<string | null>(null);
  const size = sizes.find((s) => s.id === sizeId) ?? sizes[0];
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [pixels, setPixels] = useState<PhotoPixels>({});
  const [added, setAdded] = useState(0);

  const onPixels = useCallback((id: string, px: { w: number; h: number }) => setPixels((p) => (p[id] ? p : { ...p, [id]: px })), []);
  const lowRes = useMemo(
    () => new Set(size ? selected.filter((id) => isLowResolution(pixels[id], size)) : []),
    [selected, pixels, size],
  );
  if (!size) return null;

  const addAll = () => {
    let n = 0;
    for (const id of selected) {
      const photo = photos.find((p) => p.id === id);
      if (photo && cart.add({ productId: size.id, assetId: id, quantity, fileName: photo.file_name })) n++;
    }
    setAdded(n);
    setSelected([]);
  };

  return (
    <div className="space-y-5">
      {groups.length > 1 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((list) => (
            <button
              key={list[0].productRef}
              type="button"
              onClick={() => {
                setRef(list[0].productRef);
                setSizeId(null);
                setAdded(0);
              }}
              className={`rounded-xl border px-4 py-3 text-left text-sm transition ${list[0].productRef === ref ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200"}`}
            >
              <span className="block font-medium">{list[0].productName}</span>
              <span className="text-xs text-neutral-500">
                {list[0].description ? `${list[0].description} ` : ""}Desde {formatUsd(fromPrice(list))}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">1. Tamaño (pulgadas)</p>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSizeId(s.id)}
              className={`rounded-xl border px-3 py-2 text-center text-sm transition ${s.id === size.id ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200"}`}
            >
              <span className="block font-medium">{s.sizeLabel}</span>
              <span className={`text-xs ${s.id === size.id ? "text-white/70" : "text-neutral-500"}`}>{formatUsd(s.priceCents)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">2. Elige las fotos de la galería</p>
        <GalleryPhotoPicker photos={photos} selected={selected} onChange={(ids) => { setSelected(ids); setAdded(0); }} warnIds={lowRes} onPixels={onPixels} />
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 bg-white px-5 py-4">
        {added > 0 ? (
          <>
            <p className="text-sm">
              {added === 1 ? "1 impresión agregada" : `${added} impresiones agregadas`} al carrito.
            </p>
            <a href={cartHref} className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">
              Ver carrito
            </a>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">Copias de cada una</span>
              <div className="flex items-center rounded-full border border-neutral-200 text-sm">
                <button type="button" className="h-9 w-9" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Menos">
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{quantity}</span>
                <button type="button" className="h-9 w-9" onClick={() => setQuantity((q) => Math.min(100, q + 1))} aria-label="Más">
                  +
                </button>
              </div>
            </div>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={addAll}
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {selected.length === 0
                ? "Elige al menos una foto"
                : `Agregar ${selected.length} · ${formatUsd(size.priceCents * quantity * selected.length)}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Paso previo al editor: qué fotos de la galería se cargan en él. */
function PhotoStep({
  title,
  photos,
  busy,
  onBack,
  onContinue,
}: {
  title: string;
  photos: FeedMedia[];
  busy: boolean;
  onBack: () => void;
  onContinue: (assetIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => photos.slice(0, MAX_EDITOR_PHOTOS).map((p) => p.id));
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-900">
        ← Volver
      </button>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-neutral-600">
          Elige las fotos de la galería que quieres usar. Solo estas aparecerán en el editor del laboratorio, listas para colocar o para el
          relleno automático (<em>Autofill</em>).
        </p>
      </div>
      <GalleryPhotoPicker photos={photos} selected={selected} onChange={setSelected} max={MAX_EDITOR_PHOTOS} />
      <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-neutral-100 bg-white px-5 py-4">
        <button
          type="button"
          disabled={busy || selected.length === 0}
          onClick={() => onContinue(selected)}
          className="w-full rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Abriendo el editor…" : selected.length === 0 ? "Elige al menos una foto" : `Abrir el editor con ${selected.length} ${selected.length === 1 ? "foto" : "fotos"}`}
        </button>
      </div>
    </div>
  );
}

function BooksTab({ books, busy, onDesign }: { books: StoreProduct[]; busy: boolean; onDesign: (product: StoreProduct) => void }) {
  const byProduct = useMemo(() => {
    const m = new Map<string, StoreProduct[]>();
    for (const p of books) m.set(p.productRef, [...(m.get(p.productRef) ?? []), p]);
    return [...m.values()];
  }, [books]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  return (
    <div>
      <p className="text-sm text-neutral-600">
        Elige el libro y después las fotos de la galería que quieres usar. Lo diseñas en el editor del laboratorio (en inglés) solo con
        esas fotos.
      </p>
      <ol className="mt-3 space-y-1.5 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-700">
        <li>
          <strong>1.</strong> En el editor, pasa de la portada (<em>Cover</em>) a la página <strong>2</strong>.
        </li>
        <li>
          <strong>2.</strong> Toca <strong>Autofill Spreads</strong> para llenar el libro con tus fotos, o <strong>Add Images</strong> para
          colocarlas una a una.
        </li>
        <li>
          <strong>3.</strong> ¿Quieres una foto en la portada? En <em>Cover</em>, elige <strong>Cover Type → Photo</strong>.
        </li>
        <li>
          <strong>4.</strong> Al terminar, toca <strong>Review</strong> y confirma: volverás aquí con tu libro en el carrito.
        </li>
      </ol>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {byProduct.map((list) => {
          const ref = list[0].productRef;
          const current = list.find((p) => p.id === selected[ref]) ?? list[0];
          return (
            <div key={ref} className="flex flex-col rounded-2xl border border-neutral-200 p-4">
              <p className="font-medium">{list[0].productName}</p>
              {list[0].description ? <p className="text-xs text-neutral-500">{list[0].description}</p> : null}
              <label className="mt-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase" htmlFor={`size-${ref}`}>
                Tamaño (pulgadas)
              </label>
              <select
                id={`size-${ref}`}
                value={current.id}
                onChange={(e) => setSelected((s) => ({ ...s, [ref]: e.target.value }))}
                className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sizeLabel} · desde {formatUsd(p.priceCents)}
                  </option>
                ))}
              </select>
              <p className="mt-3 text-sm text-neutral-500">Desde {formatUsd(current.priceCents)} · el precio final depende de las páginas.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDesign(current)}
                className="mt-auto rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 [margin-top:1rem]"
              >
                Elegir fotos y diseñar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CARD_FORMATS = [
  { id: "flat", label: "Plana" },
  { id: "folded", label: "Doblada" },
] as const;
const CARD_ORIENTATIONS = [
  { id: "vertical", label: "Vertical" },
  { id: "horizontal", label: "Horizontal" },
] as const;

function CardsTab({
  cards,
  projectId,
  busy,
  onDesign,
}: {
  cards: StoreProduct[];
  projectId: string;
  busy: boolean;
  onDesign: (product: StoreProduct, designId: string, designName: string) => void;
}) {
  const [occasion, setOccasion] = useState(CARD_OCCASIONS[0].tag);
  const [format, setFormat] = useState<"flat" | "folded">("flat");
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("vertical");
  const product =
    cards.find((c) => c.productRef === `5x7-${orientation}-${format}-card`) ??
    cards.find((c) => c.productRef.includes(format)) ??
    cards[0];
  const [designs, setDesigns] = useState<Design[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(
    async (next: string | null) => {
      if (!product) return;
      setLoading(true);
      setLoadError(null);
      const qs = new URLSearchParams({ projectId, productId: product.id, tag: occasion });
      if (next) qs.set("cursor", next);
      const res = await fetch(`/api/store/designs?${qs}`);
      const data = (await res.json().catch(() => ({}))) as { designs?: Design[]; nextCursor?: string | null; error?: string };
      if (!res.ok || !data.designs) setLoadError(data.error ?? "No se pudieron cargar los diseños.");
      else {
        setDesigns((d) => (next ? [...d, ...data.designs!] : data.designs!));
        setCursor(data.nextCursor ?? null);
      }
      setLoading(false);
    },
    [product, projectId, occasion],
  );

  useEffect(() => {
    setDesigns([]);
    setCursor(null);
    void load(null);
  }, [load]);

  if (!product) return null;
  return (
    <div>
      <p className="text-sm text-neutral-600">
        Elige un diseño y personalízalo con tus fotos y tu texto. {product.sizeLabel}, con sobre. Mínimo {product.minQuantity} tarjetas, desde{" "}
        {formatUsd(product.priceCents)} c/u. Después eliges las fotos de la galería; en el editor toca el espacio de la foto o{" "}
        <strong>Add Images</strong> para colocarlas, y <strong>Review</strong> al terminar.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {CARD_OCCASIONS.map((o) => (
          <Chip key={o.tag} active={o.tag === occasion} onClick={() => setOccasion(o.tag)}>
            {o.label}
          </Chip>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <Segmented options={CARD_FORMATS} value={format} onChange={setFormat} />
        <Segmented options={CARD_ORIENTATIONS} value={orientation} onChange={setOrientation} />
      </div>

      {loadError ? <p className="mt-4 text-sm text-red-600">{loadError}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {designs.map((d) => (
          <button
            key={d.id}
            type="button"
            disabled={busy}
            onClick={() => onDesign(product, d.id, d.name)}
            className="group text-left disabled:opacity-60"
          >
            <span className="block overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {d.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- vista previa de WHCC
                <img src={d.previewUrl} alt={d.name} loading="lazy" className="aspect-[5/7] w-full object-contain transition group-hover:scale-[1.02]" />
              ) : (
                <span className="block aspect-[5/7]" />
              )}
            </span>
            <span className="mt-1 block truncate text-xs font-medium">{d.name}</span>
            {d.subtitle ? <span className="block truncate text-[11px] text-neutral-500">{d.subtitle}</span> : null}
          </button>
        ))}
      </div>
      {loading ? <p className="mt-4 text-center text-sm text-neutral-500">Cargando diseños…</p> : null}
      {!loading && cursor ? (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => load(cursor)} className="rounded-full border border-neutral-300 px-5 py-2 text-sm">
            Ver más diseños
          </button>
        </div>
      ) : null}
      {busy ? <p className="mt-4 text-center text-sm text-neutral-500">Abriendo el editor…</p> : null}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm transition ${active ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-neutral-200 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-full px-3 py-1 text-sm ${o.id === value ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
