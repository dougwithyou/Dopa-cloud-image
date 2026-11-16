import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/env";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await requireUser("/portal");
  return (
    <div className="min-h-dvh bg-white sm:bg-neutral-50">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link href="/portal" className="text-lg font-bold tracking-tight">
            {APP_NAME}
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-neutral-500 hover:text-neutral-900">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-xl sm:px-4 sm:py-6">{children}</main>
    </div>
  );
}
