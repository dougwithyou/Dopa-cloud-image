"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_CART_LINES, lineKey, type CartLine } from "@/lib/store-types";

// Carrito por galería, guardado en este navegador (localStorage). Si el
// almacenamiento no está disponible (modo privado), funciona solo en memoria.

const EVENT = "hdc-cart-change";
const key = (projectId: string) => `hdc_cart_${projectId}`;
const memory = new Map<string, CartLine[]>();

function valid(l: CartLine): boolean {
  return Boolean(l && l.productId && (l.assetId || l.editorItemId) && l.quantity > 0);
}

function read(projectId: string): CartLine[] {
  try {
    const raw = window.localStorage.getItem(key(projectId));
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return memory.get(projectId) ?? [];
  }
}

function write(projectId: string, lines: CartLine[]) {
  memory.set(projectId, lines);
  try {
    window.localStorage.setItem(key(projectId), JSON.stringify(lines));
  } catch {
    // sin almacenamiento: queda en memoria
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: projectId }));
}

export function useCart(projectId: string) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    setLines(read(projectId));
    const sync = () => setLines(read(projectId));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [projectId]);

  /** Agrega una línea. Una foto repetida suma cantidad; un diseño se reemplaza. */
  const add = useCallback(
    (line: CartLine) => {
      const current = read(projectId);
      const same = current.find((l) => lineKey(l) === lineKey(line));
      if (same) {
        if (line.editorItemId) Object.assign(same, line);
        else same.quantity = Math.min(100, same.quantity + line.quantity);
      } else if (current.length < MAX_CART_LINES) current.push(line);
      else return false;
      write(projectId, current);
      return true;
    },
    [projectId],
  );

  const setQuantity = useCallback(
    (lk: string, quantity: number) => {
      const next = read(projectId)
        .map((l) => (lineKey(l) === lk ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0);
      write(projectId, next);
    },
    [projectId],
  );

  const remove = useCallback((lk: string) => write(projectId, read(projectId).filter((l) => lineKey(l) !== lk)), [projectId]);
  const clear = useCallback(() => write(projectId, []), [projectId]);

  const count = lines.reduce((n, l) => n + (l.editorItemId ? 1 : l.quantity), 0);
  return { lines, count, add, setQuantity, remove, clear };
}
