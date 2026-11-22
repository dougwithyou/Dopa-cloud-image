import Link from "next/link";
import { requireCreator } from "@/lib/auth";
import { APP_NAME } from "@/lib/env";
import { BackHome } from "@/components/back-home";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { LogOutIcon, SettingsIcon } from "@/components/icons";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { creator } = await requireCreator();
  return (
    <div className="min-h-dvh">
      <SubscriptionBanner creator={creator} />
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-bold">
            {APP_NAME}
          </Link>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-sm text-neutral-500 sm:inline">{creator.business_name}</span>
            <Link href="/dashboard/billing" className="btn-ghost px-2.5 py-2" title="Configuración">
              <SettingsIcon />
              <span className="hidden sm:inline">Configuración</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button className="btn-ghost px-2.5 py-2" title="Salir">
                <LogOutIcon />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <BackHome />
        {children}
      </main>
    </div>
  );
}
