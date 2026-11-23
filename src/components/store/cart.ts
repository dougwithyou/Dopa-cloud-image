"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_CART_LINES, MAX_LINE_QUANTITY, type CartLine } from "@/lib/store-types";

// Carrito por galería, guardado en este navegador (localStorage). Si el
// almacenamiento no está disponible (modo privado), funciona solo en memoria.

const EVENT = "hdc-cart-change";
const key = (projectId: string) => `hdc_cart_${projectId}`;

function read(projectId: string): CartLine[] {
  try {
    const raw = window.localStorage.getItem(key(projectId));
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && l.productId && l.assetId && l.quantity > 0) : [];
  } catch {
    return memory.get(projectId) ?? [];
  }
}

const memory = new Map<string, CartLine[]>();

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

  const add = useCallback(
    (line: CartLine) => {
      const current = read(projectId);
      const same = current.find((l) => l.productId === line.productId && l.assetId === line.assetId);
      if (same) same.quantity = Math.min(MAX_LINE_QUANTITY, same.quantity + line.quantity);
      else if (current.length < MAX_CART_LINES) current.push(line);
      else return false;
      write(projectId, current);
      return true;
    },
    [projectId],
  );

  const setQuantity = useCallback(
    (productId: string, assetId: string, quantity: number) => {
      const next = read(projectId)
        .map((l) => (l.productId === productId && l.assetId === assetId ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, quantity) } : l))
        .filter((l) => l.quantity > 0);
      write(projectId, next);
    },
    [projectId],
  );

  const replace = useCallback((next: CartLine[]) => write(projectId, next), [projectId]);
  const clear = useCallback(() => write(projectId, []), [projectId]);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  return { lines, count, add, setQuantity, replace, clear };
}
