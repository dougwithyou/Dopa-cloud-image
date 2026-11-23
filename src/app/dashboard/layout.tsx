import Link from "next/link";
import { dashFont } from "@/lib/fonts";
import { requireCreator } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { BackHome } from "@/components/back-home";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { LogOutIcon, SettingsIcon } from "@/components/icons";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { creator } = await requireCreator();
  return (
    <div className={`dash ${dashFont.variable} min-h-dvh`}>
      <SubscriptionBanner creator={creator} />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-4 sm:pt-6">
        <Link href="/dashboard">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/billing"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white transition hover:bg-neutral-950 hover:text-white"
            title="Configuración"
            aria-label="Configuración"
          >
            <SettingsIcon className="h-[18px] w-[18px]" />
          </Link>
          <form action="/auth/signout" method="post">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white transition hover:bg-neutral-950 hover:text-white"
              title="Salir"
              aria-label="Salir"
            >
              <LogOutIcon className="h-[18px] w-[18px]" />
            </button>
          </form>
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-950 text-sm font-semibold text-white"
            title={creator.business_name}
          >
            {creator.business_name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:pt-8">
        <BackHome />
        {children}
      </main>
    </div>
  );
}
