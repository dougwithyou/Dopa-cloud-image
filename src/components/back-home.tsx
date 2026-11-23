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
  return <BackLink href="/dashboard">Inicio</BackLink>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-5 inline-flex items-center gap-2 text-[15px] text-neutral-600 transition hover:text-neutral-950">
      <ArrowLeftIcon className="h-[18px] w-[18px]" /> {children}
    </Link>
  );
}
