"use client";

import { useEffect } from "react";
import { useCart } from "@/components/store/cart";

/** Vacía el carrito de la galería después de pagar. */
export function ClearCart({ projectId }: { projectId: string }) {
  const { clear } = useCart(projectId);
  useEffect(() => clear(), [clear]);
  return null;
}
