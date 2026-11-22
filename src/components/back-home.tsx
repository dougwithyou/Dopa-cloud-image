"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "@/components/icons";

/**
 * Enlace "← Inicio" en las pantallas de primer nivel del panel (clientes,
 * proyectos, nuevo proyecto, configuración). En el inicio no se muestra, y en
 * un proyecto concreto ya existe "← Proyectos".
 */
export function BackHome() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const isTopLevel = parts.length === 2 || pathname === "/dashboard/projects/new";
  if (!isTopLevel) return null;
  return (
    <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
      <ArrowLeftIcon className="h-4 w-4" /> Inicio
    </Link>
  );
}
