"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Resumen", exact: true },
  { href: "/dashboard/clients", label: "Clientes" },
  { href: "/dashboard/projects", label: "Proyectos" },
  { href: "/dashboard/billing", label: "Suscripción" },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {LINKS.map((link) => {
        const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
              active ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
