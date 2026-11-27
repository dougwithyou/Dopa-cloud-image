"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/components/store/cart";
import type { CartLine } from "@/lib/store-types";
import { useI18n } from "@/i18n/client";

/** Agrega el diseño terminado al carrito de este navegador y lleva al carrito. */
export function AddDesignToCart({ projectId, cartHref, line }: { projectId: string; cartHref: string; line: CartLine }) {
  const { add } = useCart(projectId);
  const s = useI18n().t.store;
  useEffect(() => {
    add(line);
    window.location.replace(cartHref);
  }, [add, line, cartHref]);
  return <p className="text-sm text-neutral-500">{s.addingDesign}</p>;
}

/** Vuelve a abrir el editor de WHCC para un diseño existente. */
export function KeepEditingButton({ projectId, editorItemId, label }: { projectId: string; editorItemId: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = useI18n().t.store;
  return (
    <div className="mt-6">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await fetch("/api/store/editor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, editorItemId }),
          });
          const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
          if (data.url) window.location.href = data.url;
          else {
            setError(data.error ?? s.openEditorFailed);
            setPending(false);
          }
        }}
        className="rounded-full bg-neutral-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? s.opening : label}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
